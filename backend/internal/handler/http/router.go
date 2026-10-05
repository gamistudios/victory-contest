package http

import (
	"context"
	"net/http"
	"net/url"
	"victory-contest-go/internal/awsconfig"
	"victory-contest-go/internal/repository"
	"victory-contest-go/internal/schema"
	"victory-contest-go/internal/usecase"

	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

// Server holds all dependencies for the application.
type Server struct {
	contestHandler             *ContestHandler
	studentHandler             *StudentHandler
	questionHandler            *QuestionHandler
	submissionHandler          *SubmissionHandler
	adminHandler               *AdminHandler
	notificationHandler        *NotificationHandler
	achievementHandler         *AchievementHandler
	bankHandler                *BankHandler
	contestRegistrationHandler *ContestRegistrationHandler
	feedbackQuestionHandler    *FeedbackQuestionHandler
	pollOptionHandler          *PollOptionHandler
	feedbackResponseHandler    *FeedbackResponseHandler
	paymentHandler             *PaymentHandler
	paymentSettingsHandler     *PaymentSettingsHandler
	aiHandler                  *AiHandler
	aiAdminHandler             *AiAdminHandler
	telegramHandler            *telegramHandler
	telegramAuthHandler        *telegramAuthHandler
	pageViewHandler            *PageViewHandler
	articleHandler             *ArticleHandler
	imageHandler               *ImageHandler
	contestStatisticsHandler   *ContestStatisticsHandler
	jwtSecret                  string
	aiRequestsPerMinute        int
}

func NewServer() *Server {

	// Bot — optional: API boots without it, webhook route reports it as disabled
	var bot *tgbotapi.BotAPI
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" {
		log.Println("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled")
	} else if b, err := tgbotapi.NewBotAPI(botToken); err != nil {
		log.Printf("failed to initialize Telegram bot, disabling: %v", err)
	} else {
		bot = b
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET environment variable is not set")
	}
	aiRequestsPerMinute, err := strconv.Atoi(os.Getenv("AI_REQUESTS_PER_MINUTE"))
	if err != nil || aiRequestsPerMinute <= 0 {
		aiRequestsPerMinute = 30 // default: 30 Gemini-backed requests per client per minute
	}

	// --- Initialize Repositories ---
	// One AWS config + one DynamoDB client for the whole process (issue #45),
	// built in internal/awsconfig and injected into every repository.
	awsCfg, err := awsconfig.Load(context.Background())
	if err != nil {
		log.Fatalf("unable to load AWS SDK config: %v", err)
	}
	ddb := awsconfig.DynamoClient(awsCfg)

	// Startup migration: create every table (and GSI) the repositories touch
	// when missing, so a fresh deployment self-heals instead of serving
	// ResourceNotFoundException 500s (the ai_providers 2026-10-05 incident).
	// Best-effort: a DynamoDB outage must not keep the API from booting —
	// the failure is logged and the next boot retries.
	if created, err := schema.EnsureTables(context.Background(), ddb, schema.Tables); err != nil {
		log.Printf("schema migration incomplete (created %v): %v", created, err)
	} else if len(created) > 0 {
		log.Printf("schema migration created tables: %v", created)
	}

	imgRepo := repository.NewImageRepository()
	questionRepo := repository.NewQuestionDynamoRepository(ddb, "question")
	contestRepo := repository.NewContestDynamoRepository(ddb, "contests")
	studentRepo := repository.NewStudentDynamoRepository(ddb, "student")
	submissionRepo := repository.NewSubmissionDynamoRepository(ddb, "submissions")
	adminRepo := repository.NewAdminDynamoRepository(ddb, "admin")
	notificationRepo := repository.NewNotificationDynamoRepository(ddb, "notification")
	achievementRepo := repository.NewAchievementDynamoRepository(ddb, "achievement")
	bankRepo := repository.NewBankDynamoRepository(ddb, "banks")
	contestRegistrationRepo := repository.NewContestRegistrationDynamoRepository(ddb, "contest_registeration")
	paymentRepo := repository.NewDynamoDBPaymentRepository(ddb, "payment")
	pageViewRepo := repository.NewPageViewDynamoRepository(ddb, "pageviews")
	articleRepo := repository.NewArticleDynamoRepository(ddb, "articles")
	commentRepo := repository.NewCommentDynamoRepository(ddb, "comments")
	aiProviderRepo := repository.NewAiProviderDynamoRepository(ddb, "ai_providers")
	aiSettingsRepo := repository.NewAiSettingsDynamoRepository(ddb, "ai_settings")
	paymentSettingsRepo := repository.NewPaymentSettingsDynamoRepository(ddb, "payment_settings")

	// --- Initialize Feedback Repositories ---
	feedbackQuestionRepo := repository.NewFeedbackQuestionDynamoRepository(ddb, "feedback_questions")
	pollOptionRepo := repository.NewPollOptionDynamoRepository(ddb, "poll_options")
	feedbackResponseRepo := repository.NewFeedbackResponseDynamoRepository(ddb, "feedback_responses")

	// --- Initialize Use Cases ---
	contestUsecase := usecase.NewContestUsecase(contestRepo, questionRepo)
	studentUsecase := usecase.NewStudentUsecase(studentRepo, paymentRepo, submissionRepo, contestRepo)
	questionUsecase := usecase.NewQuestionUsecase(questionRepo)
	submissionUsecase := usecase.NewSubmissionUsecase(submissionRepo, contestUsecase, questionRepo, studentRepo)
	adminUsecase := usecase.NewAdminUsecase(adminRepo, studentRepo, contestRepo, submissionRepo, contestRegistrationRepo, paymentRepo, pageViewRepo)
	pageViewUsecase := usecase.NewPageViewUsecase(pageViewRepo)
	articleUsecase := usecase.NewArticleUsecase(articleRepo, commentRepo)
	notificationUsecase := usecase.NewNotificationUsecase(notificationRepo, contestRepo, studentRepo)
	achievementUsecase := usecase.NewAchievementUsecase(achievementRepo)
	bankUsecase := usecase.NewBankUsecase(bankRepo)
	contestRegistrationUsecase := usecase.NewContestRegistrationUsecase(contestRegistrationRepo)
	paymentUsecase := usecase.NewPaymentUsecases(paymentRepo)
	aiUsecase := usecase.NewAiUsecase(submissionRepo, aiProviderRepo)
	aiProviderUsecase := usecase.NewAiProviderUsecase(aiProviderRepo)
	aiSettingsUsecase := usecase.NewAiSettingsUsecase(aiSettingsRepo, paymentRepo)
	paymentSettingsUsecase := usecase.NewPaymentSettingsUsecase(paymentSettingsRepo)
	telegramUsecase := usecase.NewTelegramUsecase(bot, studentRepo, paymentUsecase, paymentSettingsUsecase)

	// Auto-register the Telegram webhook on every boot: getWebhookInfo first,
	// setWebhook only when unset or pointing elsewhere — a restart is a no-op,
	// a redeploy that moved the URL re-points Telegram. Best-effort: a Telegram
	// outage must not keep the API from booting; the failure is logged and the
	// next boot retries. TELEGRAM_WEBHOOK_URL is the full public webhook URL.
	if bot != nil {
		if webhookURL := os.Getenv("TELEGRAM_WEBHOOK_URL"); webhookURL != "" {
			if err := telegramUsecase.EnsureWebhook(webhookURL, os.Getenv("TELEGRAM_WEBHOOK_SECRET")); err != nil {
				log.Printf("telegram: webhook auto-registration failed (bot stays enabled, retried on next boot): %v", err)
			}
		} else {
			log.Println("TELEGRAM_WEBHOOK_URL not set — skipping webhook auto-registration")
		}
	}

	// --- Initialize Contest Statistics Use Case ---
	contestStatisticsUsecase := usecase.NewContestStatisticsUsecase(contestUsecase, submissionUsecase, studentUsecase, questionUsecase, nil)

	// --- Initialize Feedback Use Cases ---
	feedbackQuestionUsecase := usecase.NewFeedbackQuestionUsecase(feedbackQuestionRepo)
	pollOptionUsecase := usecase.NewPollOptionUsecase(pollOptionRepo)
	feedbackResponseUsecase := usecase.NewFeedbackResponseUsecase(feedbackResponseRepo)

	// --- Initialize Handlers ---
	server := &Server{
		contestHandler:             NewContestHandler(contestUsecase, notificationUsecase),
		studentHandler:             NewStudentHandler(studentUsecase, notificationUsecase),
		questionHandler:            NewQuestionHandler(questionUsecase, imgRepo, aiUsecase),
		submissionHandler:          NewSubmissionHandler(submissionUsecase),
		adminHandler:               NewAdminHandler(adminUsecase, jwtSecret),
		notificationHandler:        NewNotificationHandler(notificationUsecase),
		achievementHandler:         NewAchievementHandler(achievementUsecase),
		bankHandler:                NewBankHandler(bankUsecase),
		contestRegistrationHandler: NewContestRegistrationHandler(contestRegistrationUsecase),
		feedbackQuestionHandler:    NewFeedbackQuestionHandler(feedbackQuestionUsecase, notificationUsecase),
		pollOptionHandler:          NewPollOptionHandler(pollOptionUsecase),
		feedbackResponseHandler:    NewFeedbackResponseHandler(feedbackResponseUsecase, notificationUsecase),
		paymentHandler:             NewPaymentHandler(paymentUsecase, *imgRepo),
		paymentSettingsHandler:     NewPaymentSettingsHandler(paymentSettingsUsecase),
		aiHandler:                  NewAiHandler(aiUsecase, aiSettingsUsecase, jwtSecret),
		aiAdminHandler:             NewAiAdminHandler(aiProviderUsecase, aiSettingsUsecase),
		telegramHandler:            NewTelegramHandler(telegramUsecase, os.Getenv("TELEGRAM_WEBHOOK_SECRET")),
		pageViewHandler:            NewPageViewHandler(pageViewUsecase),
		articleHandler:             NewArticleHandler(articleUsecase),
		imageHandler:               NewImageHandler(imgRepo),
		contestStatisticsHandler:   NewContestStatisticsHandler(contestStatisticsUsecase),
		jwtSecret:                  jwtSecret,
		aiRequestsPerMinute:        aiRequestsPerMinute,
	}
	server.telegramAuthHandler = newTelegramAuthHandler(jwtSecret, botToken, os.Getenv("ALLOW_DEV_AUTH") == "true")
	if server.telegramAuthHandler.allowDevAuth {
		log.Println("ALLOW_DEV_AUTH=true — /api/telegram/auth/dev mints UNVERIFIED student sessions; NEVER enable in production")
	}
	// Student session auth (S2): the token minted by /api/telegram/auth must
	// match the client-declared Telegram id on the identity-critical routes.
	studentAuthMw := studentAuth([]byte(jwtSecret))
	server.studentHandler.studentAuthMw = studentAuthMw
	server.submissionHandler.studentAuthMw = studentAuthMw
	server.paymentHandler.studentAuthMw = studentAuthMw
	server.telegramHandler.studentAuthMw = studentAuthMw
	server.studentHandler.studentEditMw = studentSelfOrAdminAuth([]byte(jwtSecret))
	return server
}

// corsAllowedOrigins parses the CORS_ALLOWED_ORIGINS environment variable: a
// comma-separated list of exact origins (scheme://host[:port]) that are allowed
// to make credentialed cross-origin requests. An empty/unset value means
// "local development mode" (see isDevAllowedOrigin).
func corsAllowedOrigins() []string {
	var out []string
	for _, o := range strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			out = append(out, strings.ToLower(o))
		}
	}
	return out
}

// isDevAllowedOrigin reports whether origin is a loopback dev origin on any
// port (http://localhost:*, http://127.0.0.1:*, and their https:// and bare
// host forms). It deliberately does NOT accept *.devtunnels.ms subdomains:
// those are user-controllable (any GitHub user can spin up a tunnel) and must
// never receive credentialed CORS (issue #10).
func isDevAllowedOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Hostname() == "" {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	return host == "localhost" || host == "127.0.0.1"
}

// isOriginAllowed is the pure origin-check used by the CORS middleware:
// exact-match against the configured allowlist when set, otherwise dev default.
func isOriginAllowed(origin string, allowlist []string) bool {
	if origin == "" {
		return false
	}
	normalized := strings.ToLower(origin)
	if len(allowlist) > 0 {
		for _, allowed := range allowlist {
			if normalized == allowed {
				return true
			}
		}
		return false
	}
	return isDevAllowedOrigin(normalized)
}

// corsMiddleware enforces the CORS policy: only an allowed origin is echoed in
// Access-Control-Allow-Origin (never "*", since AllowCredentials is on), and
// Vary: Origin is always set so caches key on the request origin. Arbitrary
// origins are never reflected.
func corsMiddleware(allowlist []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		res := c.Writer.Header()
		res.Add("Vary", "Origin")
		// Preflight requests carry no cookies and must never be poisoned with
		// allow headers for a disallowed origin, so only echo when allowed.
		if isOriginAllowed(origin, allowlist) {
			res.Set("Access-Control-Allow-Origin", origin)
			res.Set("Access-Control-Allow-Credentials", "true")
			res.Set("Access-Control-Expose-Headers", "Content-Length")
		}
		if c.Request.Method == "OPTIONS" {
			if isOriginAllowed(origin, allowlist) {
				res.Set("Access-Control-Allow-Methods", "PUT, PATCH, POST, GET, DELETE, OPTIONS")
				res.Set("Access-Control-Allow-Headers", "Origin, Authorization, Content-Type, Accept, X-Requested-With, Sec-Fetch-Mode, Sec-Fetch-Dest, Sec-Fetch-Site, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform")
				res.Set("Access-Control-Max-Age", "43200")
			}
			c.AbortWithStatus(204) // StatusNoContent
			return
		}
		c.Next()
	}
}

func (s *Server) NewRouter() *gin.Engine {
	r := gin.Default()
	r.Use(corsMiddleware(corsAllowedOrigins()))

	// adminAuth guards every non-login admin surface (issue #6). Handlers
	// take it as an optional RegisterRoutes argument so route-level tests
	// can register handlers without the gate.
	adminAuthMw := adminAuth([]byte(s.jwtSecret))

	api := r.Group("/api")
	s.contestHandler.RegisterRoutes(api.Group("/contest"), adminAuthMw)
	s.studentHandler.RegisterRoutes(api.Group("/student"), adminAuthMw)
	s.questionHandler.RegisterRoutes(api.Group("/question"), adminAuthMw)
	s.submissionHandler.RegisterRoutes(api.Group("/submission"), adminAuthMw)
	s.adminHandler.RegisterRoutes(api.Group("/admin"), adminAuthMw)
	s.notificationHandler.RegisterRoutes(api.Group("/notification"), adminAuthMw)
	s.achievementHandler.RegisterRoutes(api.Group("/achievement"), adminAuthMw)
	s.bankHandler.RegisterRoutes(api.Group("/banks"), adminAuthMw)
	s.contestRegistrationHandler.RegisterRoutes(api.Group("/contest-registration"), adminAuthMw)
	s.feedbackQuestionHandler.RegisterRoutes(api.Group("/feedback-question"), adminAuthMw)
	s.pollOptionHandler.RegisterRoutes(api.Group("/poll-option"), adminAuthMw)
	s.feedbackResponseHandler.RegisterRoutes(api.Group("/feedback-response"), adminAuthMw)
	s.paymentHandler.RegisterRoutes(api.Group("/payment"), adminAuthMw)
	// Telegram Stars visibility: the admin-only switch CRUD plus the single
	// unauthenticated read the student payment page polls to decide whether
	// to show the Stars option at all.
	s.paymentSettingsHandler.RegisterRoutes(api, adminAuthMw)
	// Gemini-backed endpoints are the most expensive public surface: cap
	// them per client (issue #9). /api/payment/update needed no limiter —
	// it is admin-gated since #6.
	s.aiHandler.RegisterRoutes(api.Group("/ai", rateLimitByClientIP(s.aiRequestsPerMinute, float64(s.aiRequestsPerMinute))))
	// Admin-managed AI providers (table ai_providers): CRUD + connection
	// test, gated by the same adminAuth cookie the external admin panel uses.
	s.aiAdminHandler.RegisterRoutes(api.Group("/ai-admin"), adminAuthMw)
	s.telegramHandler.RegisterRoutes(api.Group("/telegram"))
	s.telegramAuthHandler.RegisterRoutes(api.Group("/telegram"))
	s.pageViewHandler.RegisterRoutes(api.Group("/pageview"), adminAuthMw)
	s.articleHandler.Register(api, adminAuthMw)
	// Image routes
	s.imageHandler.RegisterRoutes(api.Group("/images"), adminAuthMw)
	s.contestStatisticsHandler.RegisterRoutes(api.Group("/statistics"), adminAuthMw)

	// Static hosting for the bundled frontend and admin SPAs (single-origin
	// deployment, see root Dockerfile): a request is served the real file from
	// ./static/{frontend,admin} when one exists — assets, sw.js, workbox-*.js,
	// manifest, icons, … — and index.html otherwise, so client-side routing
	// and the admin PWA both work under their base paths. The admin build
	// emits /admin/* URLs (vite base) and the frontend emits root-relative
	// ones, so the two never collide.
	r.NoRoute(func(c *gin.Context) {
		reqPath := c.Request.URL.Path

		// Unknown API routes are genuine 404s, never SPA fallbacks.
		if reqPath == "/api" || strings.HasPrefix(reqPath, "/api/") {
			c.JSON(404, gin.H{"error": "Not found"})
			return
		}

		if reqPath == "/admin" {
			// The admin router is mounted at basename /admin; handing it the
			// un-slashed URL makes stripBasename fail and every route miss,
			// which renders an empty page. Canonicalize to /admin/.
			c.Redirect(http.StatusMovedPermanently, "/admin/")
			return
		}

		if strings.HasPrefix(reqPath, "/admin/") {
			serveStatic(c, "./static/admin", strings.TrimPrefix(reqPath, "/admin/"))
			return
		}

		serveStatic(c, "./static/frontend", strings.TrimPrefix(reqPath, "/"))
	})

	return r
}

// serveStatic resolves reqPath against staticRoot and serves the real file
// when one exists; otherwise index.html for SPA routes, or 404 for anything
// that looks like a missing asset. Serving index.html for a stale .js path is
// what turns a re-deploy into a blank page: the browser refuses to execute
// text/html as a module script and the app never mounts.
func serveStatic(c *gin.Context, staticRoot, reqPath string) {
	filePath := filepath.Join(staticRoot, filepath.Clean("/"+reqPath))
	if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
		// Hashed asset URLs never change content — cache them hard. The shell
		// (index.html, sw.js, manifest) must revalidate or a deploy leaves
		// clients on the old build pointing at deleted assets.
		if strings.HasPrefix(reqPath, "assets/") {
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			c.Header("Cache-Control", "no-cache")
		}
		c.File(filePath)
		return
	}

	if filepath.Ext(reqPath) != "" {
		// Looks like a file (bundle.js, logo.png, …) but does not exist: a
		// genuine 404, never an HTML fallback.
		c.JSON(404, gin.H{"error": "Not found"})
		return
	}
	c.Header("Cache-Control", "no-cache")
	c.File(filepath.Join(staticRoot, "index.html"))
}
