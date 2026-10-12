/**
 * Compact content table that expands the original seed so every subject has a
 * browsable course. Each row becomes a full LearningModule (markdown, objectives,
 * transcript, slides) via buildModule(). Content is sample text for the mock.
 */
import type { Chapter, DocumentAttachment, LearningModule, Subject, VideoLesson } from "@/types/academy";
import { generateFlashcardsFromMarkdown } from "./generators";

interface Row {
  id: string;
  title: string;
  min: number;
  diff: LearningModule["difficulty"];
  term: string;
  def: string;
  points: [string, string, string];
  tip: string;
  video?: boolean;
  doc?: boolean;
  premium?: boolean;
}

interface ChapterRow {
  id: string;
  title: string;
  description: string;
  premium?: boolean;
  modules: Row[];
}

interface SubjectRows {
  subject_id: string;
  chapters: ChapterRow[];
}

const VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
];

/* Chapters that already exist in the original seed but have missing modules. */
export const EXTRA_MODULES_FOR_EXISTING: Record<string, Row[]> = {
  "chap-math-2": [
    {
      id: "mod-math-201",
      title: "Limits and Continuity",
      min: 30,
      diff: "Intermediate",
      term: "Limit of a function",
      def: "The limit of f(x) as x approaches a is L if f(x) can be made arbitrarily close to L by taking x sufficiently close to a (but not equal to a).",
      points: [
        "A limit describes the value a function approaches, not necessarily the value it takes.",
        "A function is continuous at a when the limit equals f(a).",
        "Limits of rational functions at a hole are found by factoring and cancelling.",
      ],
      tip: "If direct substitution gives 0/0, factor or rationalise before concluding the limit does not exist.",
      video: true,
    },
    {
      id: "mod-math-202",
      title: "Derivatives and the Chain Rule",
      min: 35,
      diff: "Intermediate",
      term: "Derivative",
      def: "The derivative of f at x is the limit of the difference quotient (f(x+h) − f(x)) / h as h → 0; it gives the instantaneous rate of change.",
      points: [
        "Power rule: d/dx xⁿ = n·xⁿ⁻¹.",
        "Chain rule: d/dx f(g(x)) = f′(g(x))·g′(x).",
        "Set f′(x) = 0 to locate candidate maxima and minima.",
      ],
      tip: "Name the inner function first; most chain-rule mistakes come from forgetting to multiply by g′(x).",
      doc: true,
    },
  ],
  "chap-math-3": [
    {
      id: "mod-math-301",
      title: "Indefinite Integrals and Substitution",
      min: 32,
      diff: "Intermediate",
      term: "Antiderivative",
      def: "An antiderivative of f is a function F with F′(x) = f(x). The family of all antiderivatives is written ∫ f(x) dx = F(x) + C.",
      points: [
        "Power rule for integrals: ∫ xⁿ dx = xⁿ⁺¹/(n+1) + C for n ≠ −1.",
        "u-substitution reverses the chain rule.",
        "Always add the constant of integration C.",
      ],
      tip: "Choose u as the inside of a composite function whose derivative also appears in the integrand.",
      video: true,
    },
    {
      id: "mod-math-302",
      title: "Definite Integrals and Area",
      min: 34,
      diff: "Advanced",
      term: "Definite integral",
      def: "The definite integral of f from a to b is the signed area between the graph of f and the x-axis; by the Fundamental Theorem it equals F(b) − F(a).",
      points: [
        "Area above the axis counts as positive, below as negative.",
        "Area between two curves: ∫ (top − bottom) dx.",
        "Swapping the limits changes the sign of the integral.",
      ],
      tip: "Sketch the curves first so you know which function is on top over each interval.",
      doc: true,
    },
  ],
  "chap-math-4": [
    {
      id: "mod-math-401",
      title: "Dot and Cross Products",
      min: 36,
      diff: "Advanced",
      term: "Dot product",
      def: "The dot product of vectors a and b is a·b = |a||b|cos θ = a₁b₁ + a₂b₂ + a₃b₃; it is a scalar and equals zero for perpendicular vectors.",
      points: [
        "Cross product a×b is a vector perpendicular to both a and b.",
        "|a×b| equals the area of the parallelogram spanned by a and b.",
        "Use a·b = 0 to test perpendicularity.",
      ],
      tip: "Dot gives a number, cross gives a vector — check the type of your answer.",
      video: true,
      doc: true,
    },
  ],
  "chap-phys-1": [
    {
      id: "mod-phys-102",
      title: "Second Law and the Carnot Cycle",
      min: 33,
      diff: "Advanced",
      term: "Carnot efficiency",
      def: "The maximum efficiency of any heat engine operating between a hot reservoir at T_h and a cold reservoir at T_c (in kelvin) is η = 1 − T_c / T_h.",
      points: [
        "Heat cannot flow spontaneously from cold to hot.",
        "No real engine can exceed Carnot efficiency.",
        "Temperatures must be in kelvin.",
      ],
      tip: "Convert °C to K before substituting; this is the most common lost mark.",
      video: true,
    },
  ],
  "chap-phys-2": [
    {
      id: "mod-phys-201",
      title: "Interference and Diffraction",
      min: 31,
      diff: "Intermediate",
      term: "Constructive interference",
      def: "Constructive interference occurs when two waves meet in phase, i.e. their path difference is a whole number of wavelengths (Δ = mλ), producing a larger amplitude.",
      points: [
        "Destructive interference needs a path difference of (m + ½)λ.",
        "Young's double slit: fringe spacing β = λD / d.",
        "Diffraction is the spreading of waves around obstacles or through slits.",
      ],
      tip: "Write the path-difference condition first, then solve for the unknown.",
      doc: true,
    },
  ],
  "chap-econ-1": [],
};

/** New chapters for subjects that had none, plus a second chapter for economics. */
export const EXPANSION: SubjectRows[] = [
  {
    subject_id: "sub-g12-ns-chem",
    chapters: [
      {
        id: "chap-chem-1",
        title: "Chapter 1: Chemical Equilibrium",
        description: "Reversible reactions, Kc, and Le Chatelier's principle.",
        modules: [
          {
            id: "mod-chem-101",
            title: "Reversible Reactions and Kc",
            min: 26,
            diff: "Intermediate",
            term: "Equilibrium constant (Kc)",
            def: "For aA + bB ⇌ cC + dD at equilibrium, Kc = [C]^c[D]^d / [A]^a[B]^b, using equilibrium concentrations; it depends only on temperature.",
            points: [
              "At equilibrium, forward and reverse rates are equal — not the concentrations.",
              "Pure solids and liquids are left out of Kc.",
              "A large Kc means products are favoured.",
            ],
            tip: "Write the Kc expression from the balanced equation before plugging numbers in.",
            video: true,
          },
          {
            id: "mod-chem-102",
            title: "Le Chatelier's Principle",
            min: 24,
            diff: "Intermediate",
            term: "Le Chatelier's principle",
            def: "When a system at equilibrium is disturbed, it shifts in the direction that partially counteracts the disturbance.",
            points: [
              "Adding reactant shifts the equilibrium toward products.",
              "Raising temperature favours the endothermic direction.",
              "A catalyst speeds both directions equally and does not shift equilibrium.",
            ],
            tip: "Treat heat as a reactant or product to predict temperature effects.",
            doc: true,
          },
        ],
      },
      {
        id: "chap-chem-2",
        title: "Chapter 2: Electrochemistry",
        description: "Redox, galvanic cells, and electrolysis.",
        premium: true,
        modules: [
          {
            id: "mod-chem-201",
            title: "Galvanic Cells",
            min: 30,
            diff: "Advanced",
            term: "Galvanic cell",
            def: "A galvanic cell converts chemical energy into electrical energy through spontaneous redox reactions; oxidation occurs at the anode and reduction at the cathode.",
            points: [
              "Electrons flow from anode to cathode through the external circuit.",
              "E°cell = E°cathode − E°anode.",
              "A positive E°cell means the reaction is spontaneous.",
            ],
            tip: "Remember: AN OX, RED CAT — oxidation at the anode, reduction at the cathode.",
            video: true,
          },
          {
            id: "mod-chem-202",
            title: "Electrolysis and Faraday's Laws",
            min: 28,
            diff: "Advanced",
            term: "Faraday's first law",
            def: "The mass of a substance produced at an electrode is proportional to the quantity of charge passed through the electrolyte (m = ZQ).",
            points: [
              "Charge Q = current × time.",
              "One mole of electrons carries about 96 500 C (the Faraday constant).",
              "More electrons per ion means less mass per coulomb.",
            ],
            tip: "Convert minutes to seconds before computing Q = It.",
          },
        ],
      },
    ],
  },
  {
    subject_id: "sub-g12-ns-bio",
    chapters: [
      {
        id: "chap-bio-1",
        title: "Chapter 1: Molecular Genetics",
        description: "DNA structure, replication, and protein synthesis.",
        modules: [
          {
            id: "mod-bio-101",
            title: "DNA Structure and Replication",
            min: 27,
            diff: "Intermediate",
            term: "Semi-conservative replication",
            def: "During DNA replication each new double helix contains one original (parent) strand and one newly synthesised strand.",
            points: [
              "Helicase unwinds the double helix at the replication fork.",
              "DNA polymerase adds nucleotides in the 5′→3′ direction.",
              "Base pairing: A–T and G–C.",
            ],
            tip: "Replication copies DNA; transcription copies DNA to RNA — don't mix the two.",
            video: true,
          },
          {
            id: "mod-bio-102",
            title: "Transcription and Translation",
            min: 29,
            diff: "Intermediate",
            term: "Central dogma",
            def: "Genetic information flows from DNA to RNA to protein: DNA is transcribed into mRNA, which is translated into a polypeptide at the ribosome.",
            points: [
              "Codons are triplets of mRNA bases that specify amino acids.",
              "tRNA anticodons pair with mRNA codons.",
              "AUG is the start codon.",
            ],
            tip: "In RNA, thymine (T) is replaced by uracil (U).",
            doc: true,
          },
        ],
      },
      {
        id: "chap-bio-2",
        title: "Chapter 2: Biotechnology",
        description: "Gene cloning, PCR, and applications.",
        premium: true,
        modules: [
          {
            id: "mod-bio-201",
            title: "PCR and Gene Cloning",
            min: 25,
            diff: "Advanced",
            term: "Polymerase chain reaction (PCR)",
            def: "PCR is a technique that exponentially amplifies a specific DNA segment through repeated cycles of denaturation, annealing and extension.",
            points: [
              "Taq polymerase tolerates the high denaturation temperature.",
              "Primers define the region that is copied.",
              "After n cycles there are about 2ⁿ copies.",
            ],
            tip: "Learn the three PCR steps in order: denature, anneal, extend.",
            video: true,
          },
        ],
      },
    ],
  },
  {
    subject_id: "sub-g12-ss-econ",
    chapters: [
      {
        id: "chap-econ-2",
        title: "Chapter 2: Money, Banking and Fiscal Policy",
        description: "Money supply, central banking, taxation and spending.",
        premium: true,
        modules: [
          {
            id: "mod-econ-201",
            title: "Monetary and Fiscal Policy",
            min: 26,
            diff: "Intermediate",
            term: "Fiscal policy",
            def: "Fiscal policy is the government's use of taxation and public spending to influence aggregate demand, output and employment.",
            points: [
              "Expansionary fiscal policy raises spending or cuts taxes.",
              "Monetary policy is run by the central bank through interest rates and reserves.",
              "A budget deficit means spending exceeds revenue.",
            ],
            tip: "Fiscal = government budget; monetary = central bank money supply.",
            video: true,
          },
          {
            id: "mod-econ-202",
            title: "Inflation and Unemployment",
            min: 24,
            diff: "Intermediate",
            term: "Inflation",
            def: "Inflation is a sustained rise in the general price level, which reduces the purchasing power of money.",
            points: [
              "Demand-pull inflation: too much demand chasing too few goods.",
              "Cost-push inflation: rising production costs.",
              "Real GDP removes the effect of price changes.",
            ],
            tip: "Always say whether you mean the price level or the inflation rate (its rate of change).",
          },
        ],
      },
    ],
  },
  {
    subject_id: "sub-g12-ss-hist",
    chapters: [
      {
        id: "chap-hist-1",
        title: "Chapter 1: The Battle of Adwa and its Legacy",
        description: "Causes, course and consequences of the 1896 victory.",
        modules: [
          {
            id: "mod-hist-101",
            title: "Causes and Course of Adwa",
            min: 22,
            diff: "Beginner",
            term: "Battle of Adwa",
            def: "The Battle of Adwa (1 March 1896) was fought between Ethiopian forces under Emperor Menelik II and invading Italian forces; the Ethiopian victory secured the country's independence.",
            points: [
              "The Treaty of Wuchale dispute over Article 17 helped trigger the war.",
              "Menelik II mobilised a large multi-regional army.",
              "The Treaty of Addis Ababa followed the Italian defeat.",
            ],
            tip: "Link causes (diplomatic dispute) to consequences (international recognition) in essays.",
            video: true,
          },
          {
            id: "mod-hist-102",
            title: "Adwa and Pan-Africanism",
            min: 20,
            diff: "Intermediate",
            term: "Pan-Africanism",
            def: "Pan-Africanism is a movement promoting the unity and solidarity of African peoples and countries, and resistance to colonial rule.",
            points: [
              "Adwa became a symbol of African resistance.",
              "Ethiopia was one of the few African states never colonised.",
              "Later movements drew inspiration from this victory.",
            ],
            tip: "Use specific dates and names to earn full marks in history questions.",
          },
        ],
      },
      {
        id: "chap-hist-2",
        title: "Chapter 2: The World Wars",
        description: "Causes and effects of the two world wars.",
        premium: true,
        modules: [
          {
            id: "mod-hist-201",
            title: "Causes of the First World War",
            min: 24,
            diff: "Intermediate",
            term: "Alliance system",
            def: "The alliance system divided Europe into opposing blocs (the Triple Entente and the Triple Alliance), turning a regional crisis into a continental war.",
            points: [
              "Militarism, alliances, imperialism and nationalism are the long-term causes.",
              "The assassination at Sarajevo in 1914 was the immediate trigger.",
              "The war ended with the 1919 Treaty of Versailles.",
            ],
            tip: "Remember the M-A-I-N causes: Militarism, Alliances, Imperialism, Nationalism.",
            video: true,
          },
        ],
      },
    ],
  },
  {
    subject_id: "sub-g12-ss-geog",
    chapters: [
      {
        id: "chap-geog-1",
        title: "Chapter 1: Geographic Information Systems",
        description: "GIS layers, remote sensing and mapping.",
        modules: [
          {
            id: "mod-geog-101",
            title: "Introduction to GIS",
            min: 21,
            diff: "Beginner",
            term: "Geographic Information System (GIS)",
            def: "A GIS is a computer-based system for capturing, storing, analysing and displaying spatially referenced data as layers on a map.",
            points: [
              "Data come as vector (points, lines, polygons) or raster (grids).",
              "Layers can be overlaid to answer location questions.",
              "GPS provides the coordinates that GIS maps.",
            ],
            tip: "Describe a map task as 'which layers, which analysis' to structure your answer.",
            video: true,
          },
          {
            id: "mod-geog-102",
            title: "Remote Sensing Basics",
            min: 20,
            diff: "Intermediate",
            term: "Remote sensing",
            def: "Remote sensing is the collection of information about the Earth's surface from a distance, usually using sensors on satellites or aircraft.",
            points: [
              "Passive sensors record reflected sunlight; active sensors emit their own signal.",
              "Different surfaces reflect wavelengths differently.",
              "Applications include land use mapping and flood monitoring.",
            ],
            tip: "Distinguish passive from active sensors with an example each.",
          },
        ],
      },
      {
        id: "chap-geog-2",
        title: "Chapter 2: Population Dynamics",
        description: "Demographic transition and migration.",
        premium: true,
        modules: [
          {
            id: "mod-geog-201",
            title: "Demographic Transition Model",
            min: 23,
            diff: "Intermediate",
            term: "Demographic transition",
            def: "The demographic transition model describes how birth and death rates fall as a society develops, moving from high stationary to low stationary population growth.",
            points: [
              "Stage 2 has falling death rates and rapid growth.",
              "Birth rates fall later due to education and urbanisation.",
              "Natural increase = birth rate − death rate.",
            ],
            tip: "Sketch the birth and death rate curves; examiners reward the labelled diagram.",
          },
        ],
      },
    ],
  },
  {
    subject_id: "sub-rem-math",
    chapters: [
      {
        id: "chap-rem-1",
        title: "Chapter 1: Matrix Algebra",
        description: "Matrix operations, determinants and inverses.",
        modules: [
          {
            id: "mod-rem-101",
            title: "Matrix Operations",
            min: 28,
            diff: "Intermediate",
            term: "Matrix multiplication",
            def: "The product AB is defined when the number of columns of A equals the number of rows of B; entry (i, j) is the dot product of row i of A and column j of B.",
            points: [
              "Matrix multiplication is generally not commutative.",
              "The identity matrix I satisfies AI = IA = A.",
              "Addition requires matrices of the same size.",
            ],
            tip: "Check dimensions first: (m×n)(n×p) gives (m×p).",
            video: true,
          },
          {
            id: "mod-rem-102",
            title: "Determinants and Inverses",
            min: 30,
            diff: "Advanced",
            term: "Inverse matrix",
            def: "A square matrix A has an inverse A⁻¹ with AA⁻¹ = I exactly when det(A) ≠ 0.",
            points: [
              "For a 2×2 matrix, det = ad − bc.",
              "A⁻¹ = (1/det) · adj(A).",
              "A zero determinant means the matrix is singular.",
            ],
            tip: "Compute the determinant first; if it is zero, stop — no inverse exists.",
            doc: true,
          },
        ],
      },
      {
        id: "chap-rem-2",
        title: "Chapter 2: Bridge Calculus",
        description: "Functions, limits and derivatives for freshmen.",
        premium: true,
        modules: [
          {
            id: "mod-rem-201",
            title: "Functions and Limits Review",
            min: 27,
            diff: "Intermediate",
            term: "Domain of a function",
            def: "The domain of a function is the set of all input values for which the function is defined.",
            points: [
              "Denominators cannot be zero.",
              "Even roots require non-negative radicands.",
              "Logarithms need positive arguments.",
            ],
            tip: "List the restrictions (denominator, root, log) before solving.",
          },
        ],
      },
    ],
  },
  {
    subject_id: "sub-exit-cs",
    chapters: [
      {
        id: "chap-cs-1",
        title: "Chapter 1: Algorithms and Data Structures",
        description: "Complexity, sorting, stacks and queues.",
        modules: [
          {
            id: "mod-cs-101",
            title: "Algorithm Complexity (Big-O)",
            min: 25,
            diff: "Intermediate",
            term: "Big-O notation",
            def: "Big-O notation describes an upper bound on how an algorithm's running time or space grows as the input size n grows.",
            points: [
              "Binary search runs in O(log n).",
              "Simple sorts such as bubble sort run in O(n²).",
              "Drop constants and lower-order terms.",
            ],
            tip: "Count nested loops: two nested loops over n usually means O(n²).",
            video: true,
          },
          {
            id: "mod-cs-102",
            title: "Stacks and Queues",
            min: 22,
            diff: "Beginner",
            term: "Stack",
            def: "A stack is a last-in, first-out (LIFO) data structure supporting push and pop at one end; a queue is first-in, first-out (FIFO).",
            points: [
              "Stacks power function calls and undo features.",
              "Queues model waiting lines and task scheduling.",
              "Both offer O(1) insert and remove at their ends.",
            ],
            tip: "LIFO = stack, FIFO = queue. Say the order explicitly in exam answers.",
            doc: true,
          },
        ],
      },
      {
        id: "chap-cs-2",
        title: "Chapter 2: Database Systems",
        description: "Relational model, SQL and normalisation.",
        premium: true,
        modules: [
          {
            id: "mod-cs-201",
            title: "Relational Model and SQL",
            min: 28,
            diff: "Intermediate",
            term: "Primary key",
            def: "A primary key is a column (or set of columns) whose values uniquely identify each row in a table and cannot be NULL.",
            points: [
              "A foreign key references the primary key of another table.",
              "SELECT retrieves rows; WHERE filters them.",
              "Normalisation reduces redundancy.",
            ],
            tip: "Identify the keys first when you design or read a schema.",
            video: true,
          },
        ],
      },
    ],
  },
];

/* --------------------------------------------------------------------- */

function intro(title: string) {
  return `Welcome to **${title}**. Read the key ideas, watch the lesson, then test yourself with flashcards and a quick quiz.`;
}

function slidesFor(row: Row) {
  return [
    { slide_number: 1, title: row.title, key_points: [row.term, "Why it matters", "What you will learn"], notes: "Introduce the topic." },
    { slide_number: 2, title: "Key definition", key_points: [row.def], notes: "Read the definition aloud, then paraphrase it." },
    ...row.points.map((p, i) => ({
      slide_number: 3 + i,
      title: `Key idea ${i + 1}`,
      key_points: [p],
    })),
    { slide_number: 6, title: "Exam tip", key_points: [row.tip] },
  ];
}

export function buildModule(
  row: Row,
  ctx: { subject: Subject; chapter: ChapterRow | { id: string; premium?: boolean }; order: number },
  index: number,
): LearningModule {
  const markdown = `# ${row.title}

${intro(row.title)}

:::definition
**${row.term}**
${row.def}
:::

## Key ideas

${row.points.map((p) => `- ${p}`).join("\n")}

:::tip
**Exam tip:** ${row.tip}
:::
`;
  const video: VideoLesson | null = row.video
    ? {
        id: `vid-${row.id}`,
        title: `Video: ${row.title}`,
        type: "direct",
        url: VIDEOS[index % VIDEOS.length],
        duration_seconds: 600 + (index % 5) * 120,
        instructor_name: "Victory Academy Instructor",
        instructor_role: `${ctx.subject.name} Department`,
        description: `A guided walkthrough of **${row.title}**.\n\n- Key definition\n- Worked examples\n- Common exam traps`,
        transcript: [
          { id: "t1", timestamp_seconds: 0, time_str: "00:00", text: `Today we study ${row.title}.` },
          { id: "t2", timestamp_seconds: 60, time_str: "01:00", text: row.def },
          { id: "t3", timestamp_seconds: 180, time_str: "03:00", text: row.points[0] },
          { id: "t4", timestamp_seconds: 300, time_str: "05:00", text: row.tip },
        ],
      }
    : null;
  const docs: DocumentAttachment[] = row.doc
    ? [
        {
          id: `doc-${row.id}`,
          title: `${row.title} — Lecture Slides`,
          type: "pptx",
          url: `https://victoryacademy.edu.et/materials/${row.id}.pptx`,
          file_size_bytes: 2_400_000,
          page_or_slide_count: 6,
          estimated_minutes: 10,
          description: "Summary slides for quick revision.",
          slides: slidesFor(row),
        },
      ]
    : [];
  const mod: LearningModule = {
    id: row.id,
    chapter_id: ctx.chapter.id,
    subject_id: ctx.subject.id,
    stream_id: ctx.subject.stream_id,
    level_id: ctx.subject.level_id,
    title: row.title,
    description: row.def.length > 140 ? `${row.def.slice(0, 137)}…` : row.def,
    order: ctx.order,
    difficulty: row.diff,
    estimated_minutes: row.min,
    access_status: row.premium || ctx.chapter.premium ? "premium" : "free",
    resource_access: {},
    referral_unlock: { enabled: false, required_referrals: 2 },
    publish_status: "published",
    learning_objectives: [
      `Define ${row.term.toLowerCase()} in your own words`,
      row.points[0],
      "Apply the idea to a typical exam question",
    ],
    reading_markdown: markdown,
    video_lesson: video,
    document_attachments: docs,
    flashcard_deck: [],
    quiz: null,
    resources: [],
    created_at: "2026-09-10T08:00:00Z",
    updated_at: "2026-10-02T08:00:00Z",
  };
  mod.flashcard_deck = generateFlashcardsFromMarkdown(mod, 4, "Mixed");
  return mod;
}

export function buildChapter(c: ChapterRow, subject_id: string, order: number): Chapter {
  return {
    id: c.id,
    subject_id,
    title: c.title,
    order_number: order,
    description: c.description,
    is_premium: !!c.premium,
    module_ids: c.modules.map((m) => m.id),
  };
}
