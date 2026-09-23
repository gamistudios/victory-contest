package http

import (
	"net/url"
	"victor-contest-go/internal/repository"
	"victor-contest-go/internal/usecase"

	"log"
	"os"
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
	aiHandler                  *AiHandler
	telegramHandler            *telegramHandler
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
	if botToken := os.Getenv("TELEGRAM_BOT_TOKEN"); botToken == "" {
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
	imgRepo := repository.NewImageRepository()
	questionRepo := repository.NewQuestionDynamoRepository("eu-north-1", "question")
	contestRepo := repository.NewContestDynamoRepository("eu-north-1", "contests")
	studentRepo := repository.NewStudentDynamoRepository("eu-north-1", "student")
	submissionRepo := repository.NewSubmissionDynamoRepository("eu-north-1", "submissions")
	adminRepo := repository.NewAdminDynamoRepository("eu-north-1", "admin")
	notificationRepo := repository.NewNotificationDynamoRepository("eu-north-1", "notification")
	achievementRepo := repository.NewAchievementDynamoRepository("eu-north-1", "achievement")
	bankRepo := repository.NewBankDynamoRepository("eu-north-1", "banks")
	contestRegistrationRepo := repository.NewContestRegistrationDynamoRepository("eu-north-1", "contest_registeration")
	paymentRepo := repository.NewDynamoDBPaymentRepository("eu-north-1", "payment")
	pageViewRepo := repository.NewPageViewDynamoRepository("eu-north-1", "pageviews")
	articleRepo := repository.NewArticleDynamoRepository("eu-north-1", "articles")
	commentRepo := repository.NewCommentDynamoRepository("eu-north-1", "comments")

	// --- Initialize Feedback Repositories ---
	feedbackQuestionRepo := repository.NewFeedbackQuestionDynamoRepository("eu-north-1", "feedback_questions")
	pollOptionRepo := repository.NewPollOptionDynamoRepository("eu-north-1", "poll_options")
	feedbackResponseRepo := repository.NewFeedbackResponseDynamoRepository("eu-north-1", "feedback_responses")

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
	aiUsecase := usecase.NewAiUsecase(submissionRepo)
	telegramUsecase := usecase.NewTelegramUsecase(bot, studentRepo)

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
		questionHandler:            NewQuestionHandler(questionUsecase, imgRepo), // Corrected line
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
		aiHandler:                  NewAiHandler(aiUsecase),
		telegramHandler:            NewTelegramHandler(telegramUsecase, os.Getenv("TELEGRAM_WEBHOOK_SECRET")),
		pageViewHandler:            NewPageViewHandler(pageViewUsecase),
		articleHandler:             NewArticleHandler(articleUsecase),
		imageHandler:               NewImageHandler(imgRepo),
		contestStatisticsHandler:   NewContestStatisticsHandler(contestStatisticsUsecase),
		jwtSecret:                  jwtSecret,
		aiRequestsPerMinute:        aiRequestsPerMinute,
	}
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
	// Gemini-backed endpoints are the most expensive public surface: cap
	// them per client (issue #9). /api/payment/update needed no limiter —
	// it is admin-gated since #6.
	s.aiHandler.RegisterRoutes(api.Group("/ai", rateLimitByClientIP(s.aiRequestsPerMinute, float64(s.aiRequestsPerMinute))))
	s.telegramHandler.RegisterRoutes(api.Group("/telegram"))
	s.pageViewHandler.RegisterRoutes(api.Group("/pageview"), adminAuthMw)
	s.articleHandler.Register(api, adminAuthMw)
	// Image routes
	s.imageHandler.RegisterRoutes(api.Group("/images"), adminAuthMw)
	s.contestStatisticsHandler.RegisterRoutes(api.Group("/statistics"), adminAuthMw)

	return r
}
