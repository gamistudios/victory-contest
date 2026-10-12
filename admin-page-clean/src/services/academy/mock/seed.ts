/* AUTO-CONVERTED from the original Academy mock (camelCase → snake_case). Hand-edit freely. */
import type { Program, Stream, Subject, Chapter, LearningModule, StudentProgress } from "@/types/academy";

export const SEED_PROGRAMS: Program[] = [
 {
  "id": "grade-12",
  "name": "Grade 12 (Entrance Prep)",
  "short_code": "G12",
  "description": "Ethiopian University Entrance Examination (EUEE) standard curriculum and intensive prep.",
  "icon_name": "GraduationCap",
  "available_streams": [
   "natural-science",
   "social-science"
  ],
  "target_exam_year": "2026/2027",
  "total_modules_count": 64,
  "is_active": true
 },
 {
  "id": "grade-11",
  "name": "Grade 11",
  "short_code": "G11",
  "description": "Core preparatory curriculum establishing foundational advanced sciences and humanities.",
  "icon_name": "BookOpen",
  "available_streams": [
   "natural-science",
   "social-science"
  ],
  "total_modules_count": 48,
  "is_active": true
 },
 {
  "id": "grade-10",
  "name": "Grade 10",
  "short_code": "G10",
  "description": "National assessment level covering integrated general sciences and social studies.",
  "icon_name": "School",
  "available_streams": [
   "common"
  ],
  "total_modules_count": 36,
  "is_active": true
 },
 {
  "id": "grade-9",
  "name": "Grade 9",
  "short_code": "G9",
  "description": "Secondary transition level introducing rigorous analytical foundations.",
  "icon_name": "Sparkles",
  "available_streams": [
   "common"
  ],
  "total_modules_count": 32,
  "is_active": true
 },
 {
  "id": "remedial",
  "name": "Remedial University Program",
  "short_code": "REM",
  "description": "Special accelerated curriculum for freshman university qualifying admissions.",
  "icon_name": "Target",
  "available_streams": [
   "natural-science",
   "social-science"
  ],
  "total_modules_count": 42,
  "is_active": true
 },
 {
  "id": "exit-exam",
  "name": "University Exit Exam",
  "short_code": "EXIT",
  "description": "Comprehensive Ministry of Education competency assessment for graduating seniors.",
  "icon_name": "Award",
  "available_streams": [
   "natural-science",
   "social-science"
  ],
  "total_modules_count": 50,
  "is_active": true
 },
 {
  "id": "other-programs",
  "name": "Specialized Short Courses",
  "short_code": "SPEC",
  "description": "Math Olympiad, SAT/ACT Prep, and Computer Science foundation tracks.",
  "icon_name": "Compass",
  "available_streams": [
   "common"
  ],
  "total_modules_count": 20,
  "is_active": true
 }
];

export const SEED_STREAMS: Stream[] = [
 {
  "id": "natural-science",
  "name": "Natural Science Stream",
  "description": "Mathematics, Physics, Chemistry, Biology, and Technical Drawing.",
  "icon_name": "Atom"
 },
 {
  "id": "social-science",
  "name": "Social Science Stream",
  "description": "Economics, Geography, History, General Business, and Social Mathematics.",
  "icon_name": "Globe"
 },
 {
  "id": "common",
  "name": "Common Core Stream",
  "description": "Integrated curriculum shared by all secondary division students.",
  "icon_name": "Layers"
 }
];

export const SEED_SUBJECTS: Subject[] = [
 {
  "id": "sub-g12-ns-math",
  "name": "Mathematics (Natural Science)",
  "code": "MATH-12-NS",
  "level_id": "grade-12",
  "stream_id": "natural-science",
  "description": "Calculus, Vectors, Sequences, Coordinate Geometry, and Complex Numbers.",
  "icon_name": "Binary",
  "chapters_count": 5,
  "total_modules_count": 18,
  "color_theme": "blue"
 },
 {
  "id": "sub-g12-ns-physics",
  "name": "Physics",
  "code": "PHYS-12",
  "level_id": "grade-12",
  "stream_id": "natural-science",
  "description": "Thermodynamics, Electromagnetism, Wave Optics, and Modern Physics.",
  "icon_name": "Zap",
  "chapters_count": 4,
  "total_modules_count": 14,
  "color_theme": "amber"
 },
 {
  "id": "sub-g12-ns-chem",
  "name": "Chemistry",
  "code": "CHEM-12",
  "level_id": "grade-12",
  "stream_id": "natural-science",
  "description": "Chemical Equilibrium, Electrochemistry, Polymers, and Industrial Chemistry.",
  "icon_name": "FlaskConical",
  "chapters_count": 4,
  "total_modules_count": 12,
  "color_theme": "emerald"
 },
 {
  "id": "sub-g12-ns-bio",
  "name": "Biology",
  "code": "BIO-12",
  "level_id": "grade-12",
  "stream_id": "natural-science",
  "description": "Genetics, Molecular Biology, Biotechnology, and Ecology.",
  "icon_name": "Dna",
  "chapters_count": 4,
  "total_modules_count": 12,
  "color_theme": "teal"
 },
 {
  "id": "sub-g12-ss-econ",
  "name": "Economics",
  "code": "ECON-12",
  "level_id": "grade-12",
  "stream_id": "social-science",
  "description": "Macroeconomic Policies, Fiscal Systems, International Trade, and Monetary Economics.",
  "icon_name": "TrendingUp",
  "chapters_count": 4,
  "total_modules_count": 14,
  "color_theme": "indigo"
 },
 {
  "id": "sub-g12-ss-hist",
  "name": "History",
  "code": "HIST-12",
  "level_id": "grade-12",
  "stream_id": "social-science",
  "description": "Modern Ethiopian History, Pan-African Movements, and World Wars.",
  "icon_name": "Landmark",
  "chapters_count": 4,
  "total_modules_count": 12,
  "color_theme": "rose"
 },
 {
  "id": "sub-g12-ss-geog",
  "name": "Geography",
  "code": "GEOG-12",
  "level_id": "grade-12",
  "stream_id": "social-science",
  "description": "GIS, Remote Sensing, Demographic Trends, and Environmental Resource Management.",
  "icon_name": "MapPin",
  "chapters_count": 4,
  "total_modules_count": 12,
  "color_theme": "cyan"
 },
 {
  "id": "sub-rem-math",
  "name": "Remedial Higher Mathematics",
  "code": "REM-MATH",
  "level_id": "remedial",
  "stream_id": "natural-science",
  "description": "University freshman bridge calculus, matrix algebra, and analytical functions.",
  "icon_name": "Calculator",
  "chapters_count": 4,
  "total_modules_count": 16,
  "color_theme": "violet"
 },
 {
  "id": "sub-exit-cs",
  "name": "Exit Exam: Computer Science & Engineering",
  "code": "EXIT-CS",
  "level_id": "exit-exam",
  "stream_id": "natural-science",
  "description": "Algorithms, Data Structures, Database Systems, Software Engineering, and Networks.",
  "icon_name": "Cpu",
  "chapters_count": 5,
  "total_modules_count": 22,
  "color_theme": "purple"
 }
];

export const SEED_CHAPTERS: Chapter[] = [
 {
  "id": "chap-math-1",
  "subject_id": "sub-g12-ns-math",
  "title": "Chapter 1: Sequences and Series",
  "order_number": 1,
  "description": "Arithmetic progressions, geometric progressions, sigma notation, and convergence limits.",
  "is_premium": false,
  "module_ids": [
   "mod-math-101",
   "mod-math-102",
   "mod-math-103"
  ]
 },
 {
  "id": "chap-math-2",
  "subject_id": "sub-g12-ns-math",
  "title": "Chapter 2: Differential Calculus",
  "order_number": 2,
  "description": "Limits of functions, continuity, first principles, chain rule, and optimization problems.",
  "is_premium": false,
  "module_ids": [
   "mod-math-201",
   "mod-math-202"
  ]
 },
 {
  "id": "chap-math-3",
  "subject_id": "sub-g12-ns-math",
  "title": "Chapter 3: Integral Calculus & Applications",
  "order_number": 3,
  "description": "Indefinite & definite integrals, substitution, integration by parts, and area between curves.",
  "is_premium": true,
  "module_ids": [
   "mod-math-301",
   "mod-math-302"
  ]
 },
 {
  "id": "chap-math-4",
  "subject_id": "sub-g12-ns-math",
  "title": "Chapter 4: Vectors and 3D Analytic Geometry",
  "order_number": 4,
  "description": "Dot products, cross products, equation of lines and planes in space.",
  "is_premium": true,
  "module_ids": [
   "mod-math-401"
  ]
 },
 {
  "id": "chap-phys-1",
  "subject_id": "sub-g12-ns-physics",
  "title": "Chapter 1: Thermodynamics & Heat Transfer",
  "order_number": 1,
  "description": "Zeroth, first and second laws of thermodynamics, Carnot cycle, and thermal efficiency.",
  "is_premium": false,
  "module_ids": [
   "mod-phys-101",
   "mod-phys-102"
  ]
 },
 {
  "id": "chap-phys-2",
  "subject_id": "sub-g12-ns-physics",
  "title": "Chapter 2: Electromagnetic Waves & Optics",
  "order_number": 2,
  "description": "Maxwell equations qualitative review, wave interference, diffraction, and polarization.",
  "is_premium": true,
  "module_ids": [
   "mod-phys-201"
  ]
 },
 {
  "id": "chap-econ-1",
  "subject_id": "sub-g12-ss-econ",
  "title": "Chapter 1: National Income Accounting",
  "order_number": 1,
  "description": "GDP, GNP, Nominal vs Real values, Consumer Price Index (CPI), and National Balance sheet.",
  "is_premium": false,
  "module_ids": [
   "mod-econ-101"
  ]
 }
];

export const SEED_MODULES: LearningModule[] = [
 {
  "id": "mod-math-101",
  "chapter_id": "chap-math-1",
  "subject_id": "sub-g12-ns-math",
  "stream_id": "natural-science",
  "level_id": "grade-12",
  "title": "Arithmetic Progressions (AP) and General Terms",
  "description": "Master definition of Arithmetic Sequences, common difference formula d = a_(n) - a_(n-1), nth term formulation, and real-life modeling.",
  "order": 1,
  "difficulty": "Beginner",
  "estimated_minutes": 28,
  "access_status": "free",
  "publish_status": "published",
  "learning_objectives": [
   "Define an arithmetic progression and calculate the common difference d",
   "Derive and utilize the formula for the nth term: a_n = a_1 + (n - 1)d",
   "Find arithmetic means between any two given real numbers",
   "Model word problems in population growth and financial installment plans using APs"
  ],
  "reading_markdown": "# Arithmetic Progressions (AP) & The General Term\n\nWelcome to Chapter 1 of Grade 12 Natural Science Mathematics. Arithmetic sequences form the foundation for discrete series analysis, financial mathematics, and algorithmic iteration.\n\n:::definition\n**Arithmetic Progression (AP)**\nAn arithmetic progression is a sequence of numbers in which the difference between any two consecutive terms is constant. This constant value is designated as the **common difference ($d$)**.\n:::\n\n## 1. General Formula for the $n^{\\text{th}}$ Term\n\nLet the sequence be:\n$a_1, a_2, a_3, \\dots, a_n$\n\nThe terms unfold recursively:\n- $a_1 = a$\n- $a_2 = a + d$\n- $a_3 = a + 2d$\n- $a_4 = a + 3d$\n- $\\dots$\n- **$a_n = a_1 + (n - 1)d$**\n\n:::tip\n**Pro Exam Strategy:**\nWhen solving entrance exam problems where three consecutive terms in an AP are unknown, do not write $x, y, z$. Instead, express them as:\n$$(a - d), \\quad a, \\quad (a + d)$$\nTheir sum immediately eliminates $d$:\n$$(a - d) + a + (a + d) = 3a$$\nThis saves valuable minutes on timed tests!\n:::\n\n---\n\n## 2. Derivation & Worked Example\n\n:::example\n**Example 1: Finding Missing Terms**\nIn an arithmetic progression, the 4th term is $19$ and the 9th term is $44$. Find the first term ($a_1$) and the 20th term ($a_{20}$).\n\n**Step-by-Step Solution:**\n1. Formulate the two linear equations using $a_n = a_1 + (n - 1)d$:\n   $$a_4 = a_1 + 3d = 19 \\quad \\text{--- (Eq 1)}$$\n   $$a_9 = a_1 + 8d = 44 \\quad \\text{--- (Eq 2)}$$\n\n2. Subtract Equation 1 from Equation 2:\n   $$(a_1 + 8d) - (a_1 + 3d) = 44 - 19$$\n   $$5d = 25 \\implies d = 5$$\n\n3. Substitute $d = 5$ back into Equation 1:\n   $$a_1 + 3(5) = 19 \\implies a_1 + 15 = 19 \\implies a_1 = 4$$\n\n4. Now compute the 20th term ($a_{20}$):\n   $$a_{20} = a_1 + (20 - 1)d = 4 + 19(5) = 4 + 95 = 99$$\n\n**Final Answer:** $a_1 = 4$, $d = 5$, and $a_{20} = 99$.\n:::\n\n---\n\n## 3. Arithmetic Means\n\nBetween two numbers $A$ and $B$, inserting $k$ arithmetic means means constructing an arithmetic sequence of $k + 2$ total terms:\n$$A, \\quad m_1, \\quad m_2, \\dots, m_k, \\quad B$$\n\nThe common difference for inserting $k$ arithmetic means is:\n$$d = \\frac{B - A}{k + 1}$$\n\n:::warning\n**Watch Out for Off-by-One Pitfalls!**\nIf asked to insert $5$ arithmetic means between $3$ and $27$, the number of steps is $k + 1 = 6$, NOT $5$. Therefore:\n$$d = \\frac{27 - 3}{5 + 1} = \\frac{24}{6} = 4$$\nThe inserted terms are: $7, 11, 15, 19, 23$.\n:::\n\n:::key-concept\n**Summary Key Takeaways:**\n1. Constant difference: $d = a_{k+1} - a_k$\n2. General term: $a_n = a_1 + (n - 1)d$\n3. Any term $a_n$ can be expressed from an arbitrary base term $a_m$ as: $a_n = a_m + (n - m)d$\n4. Graphically, an arithmetic progression is a set of discrete collinear points with slope equal to $d$.\n:::",
  "video_lesson": {
   "id": "vid-math-101",
   "title": "Lecture 1.1: Arithmetic Progressions & Entrance Exam Shortcuts",
   "type": "direct",
   "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
   "duration_seconds": 1140,
   "instructor_name": "Dr. Dawit Abebe",
   "instructor_role": "Head of Mathematics Department, Victory Academy",
   "description": "In-depth derivation of the nth term formula, arithmetic means shortcuts, and high-frequency National Exam question patterns.",
   "transcript": [
    {
     "id": "tr-1",
     "timestamp_seconds": 0,
     "time_str": "00:00",
     "text": "Welcome students of Victory Academy. Today we begin Chapter 1 on Arithmetic Progressions."
    },
    {
     "id": "tr-2",
     "timestamp_seconds": 75,
     "time_str": "01:15",
     "text": "Notice how the common difference d connects every successive pair: a_2 minus a_1 equals d."
    },
    {
     "id": "tr-3",
     "timestamp_seconds": 210,
     "time_str": "03:30",
     "text": "Now let us examine the nth term equation: a_n equals a_1 plus n minus one times d."
    },
    {
     "id": "tr-4",
     "timestamp_seconds": 430,
     "time_str": "07:10",
     "text": "Here is a classic National Exam trick where you express three consecutive terms as a minus d, a, and a plus d."
    },
    {
     "id": "tr-5",
     "timestamp_seconds": 720,
     "time_str": "12:00",
     "text": "Look closely at arithmetic means. Remember to divide by k plus one, not k!"
    },
    {
     "id": "tr-6",
     "timestamp_seconds": 980,
     "time_str": "16:20",
     "text": "Let us wrap up with a past exam problem from the 2023 Ethiopian entrance paper."
    }
   ]
  },
  "document_attachments": [
   {
    "id": "doc-math-101-slides",
    "title": "Lecture Slides: Arithmetic Progressions & Means (PPTX)",
    "type": "pptx",
    "url": "https://victoryacademy.edu.et/materials/g12/math/AP-Lecture-Slides.pptx",
    "file_size_bytes": 4250000,
    "page_or_slide_count": 6,
    "estimated_minutes": 15,
    "description": "Comprehensive presentation slides with formula diagrams, color-coded derivations, and exercise sheets.",
    "slides": [
     {
      "slide_number": 1,
      "title": "Arithmetic Sequences: Foundations & Core Principles",
      "key_points": [
       "Formal definition of discrete sequences",
       "The signature property: Constant first differences",
       "Connection to linear functions f(n) = dn + c"
      ],
      "notes": "Emphasize that the common difference d represents the slope of the line passing through sequence coordinates.",
      "diagram_title": "Linear Discrete Points Plot"
     },
     {
      "slide_number": 2,
      "title": "Derivation of the General Term Formula",
      "key_points": [
       "a₁ = a",
       "a₂ = a + d",
       "a₃ = a + 2d",
       "General: aₙ = a₁ + (n - 1)d"
      ],
      "notes": "Highlight why it is (n - 1) and not n (the initial term starts without d)."
     },
     {
      "slide_number": 3,
      "title": "Symmetric Formulation Technique",
      "key_points": [
       "3 consecutive terms: (a - d), a, (a + d)",
       "4 consecutive terms: (a - 3d), (a - d), (a + d), (a + 3d) with step 2d",
       "Elimination of variable in sum conditions"
      ],
      "notes": "This trick reduces a 2x2 system into a single one-step equation in 90% of entrance questions."
     },
     {
      "slide_number": 4,
      "title": "Arithmetic Means Formulation",
      "key_points": [
       "Given bounds A and B, insert k intermediate values",
       "Total count of terms N = k + 2",
       "Step size d = (B - A) / (k + 1)",
       "Verification: m₁ = A + d, m_k = B - d"
      ],
      "notes": "Provide visual number line illustration."
     },
     {
      "slide_number": 5,
      "title": "National Examination Case Studies",
      "key_points": [
       "EUEE 2022 Question 14 Walkthrough",
       "EUEE 2023 Question 19 Analysis",
       "Common distractor analysis in multiple choice"
      ]
     },
     {
      "slide_number": 6,
      "title": "Self-Study Problem Set & Next Steps",
      "key_points": [
       "Solve problems 1 through 12 in the module workbook",
       "Review flashcard deck on sequence definitions",
       "Prepare for Module 1.2: Sum of Arithmetic Series"
      ]
     }
    ]
   },
   {
    "id": "doc-math-101-pdf",
    "title": "Formula Cheat Sheet & Past Exam Solved Guide (PDF)",
    "type": "pdf",
    "url": "https://victoryacademy.edu.et/materials/g12/math/AP-Formula-Sheet.pdf",
    "file_size_bytes": 1850000,
    "page_or_slide_count": 4,
    "estimated_minutes": 10,
    "description": "Printable summary cheat sheet containing all AP equations, common difference checks, and 10 fully worked solutions.",
    "slides": [
     {
      "slide_number": 1,
      "title": "Core Equations Matrix",
      "key_points": [
       "d = aₙ - aₙ₋₁",
       "aₙ = a₁ + (n - 1)d",
       "aₙ = aₘ + (n - m)d",
       "Arithmetic Mean of (x, y) = (x + y)/2"
      ]
     },
     {
      "slide_number": 2,
      "title": "Step-by-Step Decision Tree for Exam Questions",
      "key_points": [
       "If 2 arbitrary terms are known -> subtract equations to find d",
       "If sum and product are given -> use symmetric (a-d, a, a+d)",
       "If consecutive terms have variables -> set (t₂ - t₁) = (t₃ - t₂)"
      ]
     },
     {
      "slide_number": 3,
      "title": "Solved Entrance Problems (Set A)",
      "key_points": [
       "Problem 1: Finding 50th term of negative slope sequence",
       "Problem 2: Non-integer arithmetic sequences",
       "Problem 3: Word problem on annual salary ladder"
      ]
     },
     {
      "slide_number": 4,
      "title": "Practice Challenge & Answers",
      "key_points": [
       "Quick drill 1-5 with immediate key",
       "Self-assessment checklist for mastery"
      ]
     }
    ]
   }
  ],
  "flashcard_deck": [
   {
    "id": "fc-101-1",
    "question": "What is the formula for the nth term of an Arithmetic Progression?",
    "answer": "a_n = a_1 + (n - 1)d",
    "explanation": "Where a_1 is the first term, d is the common difference, and n is the position index.",
    "difficulty": "Easy",
    "source_module_id": "mod-math-101",
    "source_section": "1. General Formula for the nth Term",
    "tags": [
     "Formula",
     "AP",
     "Basics"
    ]
   },
   {
    "id": "fc-101-2",
    "question": "How do you represent three consecutive terms of an AP symmetrically?",
    "answer": "(a - d), a, (a + d)",
    "explanation": "This representation makes their sum equal to 3a, immediately canceling out the d variable.",
    "difficulty": "Medium",
    "source_module_id": "mod-math-101",
    "source_section": "Exam Strategy Callout",
    "tags": [
     "Technique",
     "Symmetry",
     "EUEE"
    ]
   },
   {
    "id": "fc-101-3",
    "question": "If you insert k arithmetic means between A and B, what is the formula for the common difference d?",
    "answer": "d = (B - A) / (k + 1)",
    "explanation": "Because inserting k terms creates a sequence with k + 2 total elements, spanning k + 1 intervals.",
    "difficulty": "Medium",
    "source_module_id": "mod-math-101",
    "source_section": "3. Arithmetic Means",
    "tags": [
     "Arithmetic Means",
     "Intervals"
    ]
   },
   {
    "id": "fc-101-4",
    "question": "If a_7 = 25 and a_11 = 41 in an AP, what is the common difference d?",
    "answer": "d = 4",
    "explanation": "a_11 - a_7 = (11 - 7)d => 4d = 41 - 25 = 16 => d = 4.",
    "difficulty": "Easy",
    "source_module_id": "mod-math-101",
    "source_section": "2. Derivation & Worked Example",
    "tags": [
     "Calculation",
     "Drill"
    ]
   },
   {
    "id": "fc-101-5",
    "question": "True or False: The sequence defined by f(n) = 3n^2 + 2 is an arithmetic progression.",
    "answer": "False",
    "explanation": "An arithmetic progression has a linear general term (first-degree in n). A quadratic term produces changing differences.",
    "difficulty": "Hard",
    "source_module_id": "mod-math-101",
    "source_section": "Key Takeaways",
    "tags": [
     "Conceptual",
     "Functions"
    ]
   }
  ],
  "quiz": {
   "id": "quiz-math-101",
   "title": "Module 1.1 Competency Quiz: Arithmetic Progressions",
   "duration_minutes": 15,
   "passing_score_percentage": 70,
   "questions": [
    {
     "id": "q-101-1",
     "type": "multiple_choice",
     "question": "In an arithmetic sequence, the 3rd term is 14 and the 7th term is 30. What is the first term (a_1)?",
     "options": [
      "4",
      "6",
      "8",
      "10"
     ],
     "correct_answers": [
      1
     ],
     "explanation": "a_7 - a_3 = 4d = 30 - 14 = 16 => d = 4. Then a_1 = a_3 - 2d = 14 - 2(4) = 6.",
     "hint": "Subtract the two terms to find 4d first.",
     "difficulty": "Easy",
     "topic_tag": "General Term"
    },
    {
     "id": "q-101-2",
     "type": "multiple_choice",
     "question": "If three numbers 2k + 1, 4k - 2, and 7k - 8 form three consecutive terms of an AP, what is the value of k?",
     "options": [
      "1",
      "2",
      "3",
      "5"
     ],
     "correct_answers": [
      2
     ],
     "explanation": "In an AP, (t_2 - t_1) = (t_3 - t_2). Thus (4k - 2) - (2k + 1) = (7k - 8) - (4k - 2) => 2k - 3 = 3k - 6 => k = 3.",
     "hint": "Equate the consecutive differences: t2 - t1 = t3 - t2.",
     "difficulty": "Medium",
     "topic_tag": "Consecutive Terms"
    },
    {
     "id": "q-101-3",
     "type": "true_false",
     "question": "Inserting 4 arithmetic means between 10 and 35 results in a common difference of 5.",
     "options": [
      "True",
      "False"
     ],
     "correct_answers": [
      0
     ],
     "explanation": "Using d = (B - A)/(k + 1) gives (35 - 10)/(4 + 1) = 25 / 5 = 5. Hence, True.",
     "difficulty": "Easy",
     "topic_tag": "Arithmetic Means"
    },
    {
     "id": "q-101-4",
     "type": "multiple_answer",
     "question": "Which of the following sequences are valid Arithmetic Progressions? (Select all that apply)",
     "options": [
      "5, 12, 19, 26, 33",
      "100, 92, 84, 76, 68",
      "2, 4, 8, 16, 32",
      "√2, 2√2, 3√2, 4√2"
     ],
     "correct_answers": [
      0,
      1,
      3
     ],
     "explanation": "Option 1 has d = +7. Option 2 has d = -8. Option 4 has d = +√2. Option 3 is a geometric sequence (ratio 2), not AP.",
     "hint": "Check if the difference between any adjacent pair remains identical.",
     "difficulty": "Medium",
     "topic_tag": "Identification"
    },
    {
     "id": "q-101-5",
     "type": "scenario",
     "scenario_context": "An Ethiopian coffee farmer plants 15 seedlings in week 1. To expand production, he increases planting by 8 additional seedlings each consecutive week.",
     "question": "How many seedlings will the farmer plant during week 14?",
     "options": [
      "112 seedlings",
      "119 seedlings",
      "127 seedlings",
      "135 seedlings"
     ],
     "correct_answers": [
      1
     ],
     "explanation": "Here a_1 = 15 and d = 8. For week n = 14: a_14 = 15 + (14 - 1)(8) = 15 + 13(8) = 15 + 104 = 119 seedlings.",
     "difficulty": "Hard",
     "topic_tag": "Real-world Modeling"
    }
   ]
  },
  "resources": [
   {
    "id": "res-1",
    "title": "Ministry of Education Official G12 Mathematics Curriculum Guide",
    "type": "cheatsheet",
    "description": "Curriculum syllabus benchmarks and competency matrix for Ethiopian schools.",
    "url": "https://moe.gov.et/curriculum"
   },
   {
    "id": "res-2",
    "title": "Desmos Interactive AP Line Grapher",
    "type": "link",
    "description": "Visualize how varying d shifts the slope of sequence points.",
    "url": "https://www.desmos.com/calculator"
   }
  ],
  "resource_access": {},
  "referral_unlock": {
   "enabled": false,
   "required_referrals": 2
  },
  "created_at": "2026-09-01T08:00:00Z",
  "updated_at": "2026-10-01T08:00:00Z"
 },
 {
  "id": "mod-math-102",
  "chapter_id": "chap-math-1",
  "subject_id": "sub-g12-ns-math",
  "stream_id": "natural-science",
  "level_id": "grade-12",
  "title": "Sum of Arithmetic Series (Sigma Notation)",
  "description": "Gauss summation technique, derivation of S_n = n/2(2a + (n-1)d), Sigma properties, and telescoping series.",
  "order": 2,
  "difficulty": "Intermediate",
  "estimated_minutes": 35,
  "access_status": "free",
  "publish_status": "published",
  "learning_objectives": [
   "Derive the Gauss arithmetic sum formula S_n = n/2 [2a_1 + (n - 1)d]",
   "Compute sums using the boundary formula S_n = n/2 [a_1 + a_n]",
   "Interpret and evaluate expressions written in Sigma (Σ) notation",
   "Solve inverse problems finding number of terms n from a given sum"
  ],
  "reading_markdown": "# Sum of Arithmetic Series (Sigma Notation)\n\nWhen we add the terms of an arithmetic progression, the resulting expression is called an **Arithmetic Series**:\n$$S_n = a_1 + a_2 + a_3 + \\dots + a_n = \\sum_{i=1}^{n} a_i$$\n\n## 1. Gauss’s Historic Discovery\n\nAs a young student, Carl Friedrich Gauss was asked to sum all integers from $1$ to $100$. He noticed that pairing terms from opposite ends yielded constant sums:\n$$1 + 100 = 101$$\n$$2 + 99 = 101$$\n$$3 + 98 = 101$$\nThere were $50$ such pairs, giving $50 \\times 101 = 5,050$.\n\n:::definition\n**Arithmetic Series Sum Formulas:**\n1. When first and last terms are known:\n   $$S_n = \\frac{n}{2}(a_1 + a_n)$$\n2. When first term and common difference are known:\n   $$S_n = \\frac{n}{2}\\big[2a_1 + (n - 1)d\\big]$$\n:::\n\n:::tip\n**Relationship Between $S_n$ and $a_n$:**\nIf you are given the sum formula $S_n$ in terms of $n$, you can immediately find any single term using:\n$$a_n = S_n - S_{n-1} \\quad (\\text{for } n \\ge 2)$$\nAnd for the first term: $a_1 = S_1$.\n:::\n\n:::example\n**Example: Evaluating Sigma Notation**\nEvaluate the series:\n$$\\sum_{k=1}^{30} (4k - 5)$$\n\n**Solution:**\n1. Identify the first term ($k = 1$):\n   $$a_1 = 4(1) - 5 = -1$$\n2. Identify the last term ($k = 30$):\n   $$a_{30} = 4(30) - 5 = 120 - 5 = 115$$\n3. Number of terms is $n = 30$.\n4. Use $S_n = \\frac{n}{2}(a_1 + a_n)$:\n   $$S_{30} = \\frac{30}{2}(-1 + 115) = 15(114) = 1,710$$\n:::",
  "video_lesson": {
   "id": "vid-math-102",
   "title": "Lecture 1.2: Arithmetic Series & Sigma Notation Mastery",
   "type": "youtube",
   "url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
   "duration_seconds": 1260,
   "instructor_name": "Dr. Dawit Abebe",
   "instructor_role": "Head of Mathematics Department, Victory Academy",
   "description": "Mastering Sigma summation, evaluating series boundaries, and finding n using quadratic factorization.",
   "transcript": [
    {
     "id": "tr-102-1",
     "timestamp_seconds": 0,
     "time_str": "00:00",
     "text": "In this lecture, we bridge the gap from single terms to total sums."
    },
    {
     "id": "tr-102-2",
     "timestamp_seconds": 120,
     "time_str": "02:00",
     "text": "Notice how reversing the sequence and adding creates 2S_n on the left side."
    },
    {
     "id": "tr-102-3",
     "timestamp_seconds": 450,
     "time_str": "07:30",
     "text": "Let us see why a_n equals S_n minus S_n-minus-1. This is a very common entrance exam question."
    }
   ]
  },
  "document_attachments": [
   {
    "id": "doc-math-102-pdf",
    "title": "Sigma Notation & Summation Workbook (PDF)",
    "type": "pdf",
    "url": "https://victoryacademy.edu.et/materials/g12/math/Series-Sum-Workbook.pdf",
    "file_size_bytes": 2100000,
    "page_or_slide_count": 5,
    "estimated_minutes": 20,
    "description": "Comprehensive workbook with 25 tiered summation problems and algebraic proofs.",
    "slides": [
     {
      "slide_number": 1,
      "title": "Foundations of Sigma Notation",
      "key_points": [
       "Index of summation and boundary limits",
       "Linearity property: Σ(ca_k + b) = cΣa_k + Σb",
       "Splitting and recombining index ranges"
      ]
     },
     {
      "slide_number": 2,
      "title": "Derivation of the S_n Formula",
      "key_points": [
       "Writing S_n forwards and backwards",
       "Adding identical column sums",
       "Division by 2 yielding n(a₁ + aₙ)/2"
      ]
     }
    ]
   }
  ],
  "flashcard_deck": [
   {
    "id": "fc-102-1",
    "question": "What is the sum formula of an AP using first and last terms?",
    "answer": "S_n = (n / 2) * (a_1 + a_n)",
    "explanation": "Derived from pairing symmetric terms.",
    "difficulty": "Easy",
    "source_module_id": "mod-math-102",
    "source_section": "1. Gauss Discovery",
    "tags": [
     "Formula",
     "Sum"
    ]
   },
   {
    "id": "fc-102-2",
    "question": "How can you find the nth term a_n when only the sum formula S_n is given?",
    "answer": "a_n = S_n - S_(n - 1) for n >= 2",
    "explanation": "Subtracting the sum of the first (n-1) terms from the sum of the first n terms leaves only the nth term.",
    "difficulty": "Medium",
    "source_module_id": "mod-math-102",
    "source_section": "Tip Callout",
    "tags": [
     "Concept",
     "Difference"
    ]
   }
  ],
  "quiz": {
   "id": "quiz-math-102",
   "title": "Practice Quiz: Series & Sigma Calculations",
   "duration_minutes": 10,
   "passing_score_percentage": 70,
   "questions": [
    {
     "id": "q-102-1",
     "type": "multiple_choice",
     "question": "Find the sum of the first 20 terms of the AP: 3, 7, 11, 15, ...",
     "options": [
      "780",
      "820",
      "840",
      "860"
     ],
     "correct_answers": [
      1
     ],
     "explanation": "a = 3, d = 4, n = 20. S_20 = 10 * [2(3) + 19(4)] = 10 * 82 = 820.",
     "difficulty": "Easy",
     "topic_tag": "Sum Formula"
    }
   ]
  },
  "resources": [],
  "resource_access": {},
  "referral_unlock": {
   "enabled": false,
   "required_referrals": 2
  },
  "created_at": "2026-09-01T08:00:00Z",
  "updated_at": "2026-10-01T08:00:00Z"
 },
 {
  "id": "mod-math-103",
  "chapter_id": "chap-math-1",
  "subject_id": "sub-g12-ns-math",
  "stream_id": "natural-science",
  "level_id": "grade-12",
  "title": "Geometric Progressions (GP) and Infinite Series",
  "description": "Common ratio r, nth term formula G_n = a * r^(n-1), finite sum, convergence test |r| < 1, and sum to infinity S_inf = a / (1 - r).",
  "order": 3,
  "difficulty": "Advanced",
  "estimated_minutes": 40,
  "access_status": "premium",
  "publish_status": "published",
  "learning_objectives": [
   "Define geometric progressions and compute the common ratio r",
   "Derive and calculate finite geometric series S_n = a(1 - r^n)/(1 - r)",
   "Analyze infinite series convergence when |r| < 1",
   "Convert recurring decimals into exact rational fractions using infinite GP"
  ],
  "reading_markdown": "# Geometric Progressions (GP) and Infinite Series\n\n:::warning\n**Premium Curriculum Module**\nThis advanced module contains full entrance exam convergence derivations and recurring decimal shortcuts.\n:::\n\n## 1. Definition and Common Ratio ($r$)\n\nA sequence where each term after the first is found by multiplying the previous one by a fixed non-zero number $r$:\n$$r = \\frac{a_{n}}{a_{n-1}}$$\n\nGeneral term:\n$$G_n = a_1 \\cdot r^{n-1}$$\n\n## 2. Sum to Infinity ($S_\\infty$)\nWhen $|r| < 1$, the terms approach zero as $n \\to \\infty$, and the series converges to:\n$$S_\\infty = \\frac{a_1}{1 - r}$$",
  "video_lesson": {
   "id": "vid-math-103",
   "title": "Advanced Masterclass: Infinite Geometric Convergence",
   "type": "direct",
   "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
   "duration_seconds": 1500,
   "instructor_name": "Dr. Dawit Abebe",
   "instructor_role": "Head of Mathematics Department, Victory Academy",
   "description": "Rigorous convergence proofs, decimal expansions, and multi-step entrance questions.",
   "transcript": [
    {
     "id": "tr-103-1",
     "timestamp_seconds": 0,
     "time_str": "00:00",
     "text": "Welcome to this premium masterclass on infinite geometric sequences."
    }
   ]
  },
  "document_attachments": [
   {
    "id": "doc-math-103-slides",
    "title": "Masterclass Presentation: GP & Fractals (PPTX)",
    "type": "pptx",
    "url": "https://victoryacademy.edu.et/materials/g12/math/GP-Masterclass.pptx",
    "file_size_bytes": 5400000,
    "page_or_slide_count": 6,
    "estimated_minutes": 25,
    "description": "Visual geometric proofs of convergence and fractal perimeter expansions.",
    "slides": [
     {
      "slide_number": 1,
      "title": "Geometric Series & Fractal Convergence",
      "key_points": [
       "Definition of common ratio",
       "Zeno paradox visualization",
       "Boundary constraints on r"
      ]
     }
    ]
   }
  ],
  "flashcard_deck": [
   {
    "id": "fc-103-1",
    "question": "Under what condition does an infinite geometric series converge?",
    "answer": "|r| < 1 (or -1 < r < 1)",
    "explanation": "If |r| >= 1, the terms do not approach 0 and the series diverges.",
    "difficulty": "Medium",
    "source_module_id": "mod-math-103",
    "source_section": "2. Sum to Infinity",
    "tags": [
     "Convergence",
     "Condition"
    ]
   }
  ],
  "quiz": {
   "id": "quiz-math-103",
   "title": "Premium Assessment: Geometric Sequences & Convergence",
   "duration_minutes": 15,
   "passing_score_percentage": 75,
   "questions": [
    {
     "id": "q-103-1",
     "type": "multiple_choice",
     "question": "What is the sum to infinity of the series: 9 + 3 + 1 + 1/3 + ...?",
     "options": [
      "12",
      "13.5",
      "14",
      "15"
     ],
     "correct_answers": [
      1
     ],
     "explanation": "a = 9, r = 3/9 = 1/3. S_inf = 9 / (1 - 1/3) = 9 / (2/3) = 13.5.",
     "difficulty": "Medium",
     "topic_tag": "Infinite Sum"
    }
   ]
  },
  "resources": [],
  "resource_access": {},
  "referral_unlock": {
   "enabled": false,
   "required_referrals": 2
  },
  "created_at": "2026-09-01T08:00:00Z",
  "updated_at": "2026-10-01T08:00:00Z"
 },
 {
  "id": "mod-phys-101",
  "chapter_id": "chap-phys-1",
  "subject_id": "sub-g12-ns-physics",
  "stream_id": "natural-science",
  "level_id": "grade-12",
  "title": "First Law of Thermodynamics & Work in Gas Expansions",
  "description": "Internal energy U, Heat Q, Work done by a gas W = ∫P dV, Isobaric, Isochoric, Isothermal, and Adiabatic processes.",
  "order": 1,
  "difficulty": "Intermediate",
  "estimated_minutes": 32,
  "access_status": "free",
  "publish_status": "published",
  "learning_objectives": [
   "State and formulate the First Law of Thermodynamics: ΔU = Q - W",
   "Calculate work done during isobaric, isothermal, and isochoric expansions",
   "Interpret PV diagrams and thermodynamic cycle loops",
   "Distinguish between state functions and path-dependent quantities"
  ],
  "reading_markdown": "# First Law of Thermodynamics & Work in Gas Expansions\n\nThe First Law of Thermodynamics is the statement of the **Law of Conservation of Energy** applied to thermal systems.\n\n:::definition\n**First Law Equation:**\n$$\\Delta U = Q - W$$\nWhere:\n- $\\Delta U$: Change in internal energy of the gas\n- $Q$: Net heat added to the system ($Q > 0$ for heat added; $Q < 0$ for heat lost)\n- $W$: Work done **by the system** on its surroundings ($W > 0$ for expansion; $W < 0$ for compression)\n:::\n\n## 1. Thermodynamic Processes on PV Diagrams\n\n| Process | Condition | Work Done ($W$) | First Law Form |\n| :--- | :--- | :--- | :--- |\n| **Isobaric** | Constant Pressure ($P = \\text{const}$) | $W = P(V_f - V_i)$ | $\\Delta U = Q - P\\Delta V$ |\n| **Isochoric (Isovolumetric)** | Constant Volume ($V = \\text{const}$) | $W = 0$ | $\\Delta U = Q$ |\n| **Isothermal** | Constant Temperature ($T = \\text{const}$) | $W = nRT \\ln(V_f / V_i)$ | $\\Delta U = 0 \\implies Q = W$ |\n| **Adiabatic** | No heat exchange ($Q = 0$) | $W = -\\Delta U$ | $\\Delta U = -W$ |\n\n:::tip\n**Sign Convention Alert:**\nIn standard Ethiopian physics curricula, work $W$ is the work done **by** the gas. Therefore in an expansion, work is positive. In chemistry, IUPAC conventions write $\\Delta U = Q + W$ where $W$ is work on the gas. Always confirm the physics convention in your exam!\n:::",
  "video_lesson": {
   "id": "vid-phys-101",
   "title": "Physics Lab: PV Diagrams & Thermodynamic Cycles",
   "type": "direct",
   "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
   "duration_seconds": 980,
   "instructor_name": "Eng. Solomon Tadesse",
   "instructor_role": "Senior Physics Lecturer, Victory Academy",
   "description": "Understanding cyclic processes, clockwise vs counterclockwise loops, and engine efficiency.",
   "transcript": [
    {
     "id": "tr-phys-1",
     "timestamp_seconds": 0,
     "time_str": "00:00",
     "text": "Welcome physics scholars. Today we analyze PV diagrams and gas expansions."
    },
    {
     "id": "tr-phys-2",
     "timestamp_seconds": 150,
     "time_str": "02:30",
     "text": "Notice that the area enclosed by a cyclic loop represents the net work output."
    }
   ]
  },
  "document_attachments": [
   {
    "id": "doc-phys-101-slides",
    "title": "Thermodynamics Diagram Handbook (PPTX)",
    "type": "pptx",
    "url": "https://victoryacademy.edu.et/materials/g12/physics/Thermodynamics-Slides.pptx",
    "file_size_bytes": 3800000,
    "page_or_slide_count": 5,
    "estimated_minutes": 18,
    "description": "Color PV diagrams, cyclic engine loops, and adiabatic expansion curves.",
    "slides": [
     {
      "slide_number": 1,
      "title": "Internal Energy & Kinetic Theory",
      "key_points": [
       "U = (3/2) nRT for monatomic ideal gases",
       "Internal energy is strictly a function of temperature T"
      ]
     },
     {
      "slide_number": 2,
      "title": "Work as Area Under PV Curve",
      "key_points": [
       "W = ∫ P dV",
       "Path dependency: Isobaric vs Isothermal work comparison"
      ]
     }
    ]
   }
  ],
  "flashcard_deck": [
   {
    "id": "fc-phys-1",
    "question": "In an isochoric process, how much work is done by the gas?",
    "answer": "Zero work (W = 0)",
    "explanation": "Because volume does not change (ΔV = 0), so W = ∫P dV = 0.",
    "difficulty": "Easy",
    "source_module_id": "mod-phys-101",
    "source_section": "1. Thermodynamic Processes",
    "tags": [
     "Thermodynamics",
     "Processes"
    ]
   },
   {
    "id": "fc-phys-2",
    "question": "For an ideal gas in an isothermal expansion, what is the change in internal energy (ΔU)?",
    "answer": "ΔU = 0",
    "explanation": "Internal energy depends only on temperature for an ideal gas. Since T is constant, ΔU = 0, so Q = W.",
    "difficulty": "Medium",
    "source_module_id": "mod-phys-101",
    "source_section": "Processes Table",
    "tags": [
     "Isothermal",
     "Energy"
    ]
   }
  ],
  "quiz": {
   "id": "quiz-phys-101",
   "title": "Physics Concept Quiz: Gas Laws & First Law",
   "duration_minutes": 12,
   "passing_score_percentage": 70,
   "questions": [
    {
     "id": "q-phys-1",
     "type": "multiple_choice",
     "question": "An ideal gas absorbs 500 J of heat and does 200 J of work expanding. What is the change in its internal energy?",
     "options": [
      "+300 J",
      "+700 J",
      "-300 J",
      "0 J"
     ],
     "correct_answers": [
      0
     ],
     "explanation": "ΔU = Q - W = +500 J - 200 J = +300 J.",
     "difficulty": "Easy",
     "topic_tag": "First Law"
    }
   ]
  },
  "resources": [],
  "resource_access": {},
  "referral_unlock": {
   "enabled": false,
   "required_referrals": 2
  },
  "created_at": "2026-09-01T08:00:00Z",
  "updated_at": "2026-10-01T08:00:00Z"
 },
 {
  "id": "mod-econ-101",
  "chapter_id": "chap-econ-1",
  "subject_id": "sub-g12-ss-econ",
  "stream_id": "social-science",
  "level_id": "grade-12",
  "title": "Gross Domestic Product (GDP): Approaches and Measurement",
  "description": "Expenditure approach (C + I + G + (X - M)), Income approach, Value Added approach, and Nominal vs Real GDP deflation.",
  "order": 1,
  "difficulty": "Beginner",
  "estimated_minutes": 26,
  "access_status": "free",
  "publish_status": "published",
  "learning_objectives": [
   "Define GDP and distinguish it from Gross National Product (GNP)",
   "Calculate GDP using the Expenditure Approach formula",
   "Compute the GDP Deflator and differentiate Nominal from Real GDP",
   "Identify transactions excluded from GDP calculations"
  ],
  "reading_markdown": "# Gross Domestic Product (GDP): Approaches and Measurement\n\nGross Domestic Product (GDP) is the primary indicator used worldwide to assess the macroeconomic health and productive capacity of a national economy.\n\n:::definition\n**Gross Domestic Product (GDP)**\nThe total market value of all **final goods and services** produced **within the domestic territorial boundaries** of a country during a specified period (typically one year).\n:::\n\n## 1. The Expenditure Approach\n\nThe standard formulation of GDP by expenditure category is:\n$$Y = C + I + G + (X - M)$$\n\nWhere:\n- **$C$ (Consumption):** Household expenditures on durable and non-durable goods.\n- **$I$ (Investment):** Business capital investment, new residential housing, and inventory changes.\n- **$G$ (Government Purchases):** Spending on public goods and services (excludes transfer payments!).\n- **$(X - M)$ (Net Exports):** Exports ($X$) minus Imports ($M$).\n\n:::warning\n**Crucial Distinction: Transfer Payments**\nGovernment transfer payments like social security, pensions, and student stipends are **NOT included in $G$** because they represent transfers of purchasing power rather than payment for current production!\n:::",
  "video_lesson": {
   "id": "vid-econ-101",
   "title": "Macroeconomics: Real vs Nominal GDP & Deflator",
   "type": "direct",
   "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
   "duration_seconds": 840,
   "instructor_name": "Hana Kebede, M.Sc.",
   "instructor_role": "Lead Economics Specialist, Victory Academy",
   "description": "Calculating price indexes, base year adjustments, and avoiding double counting in national accounts.",
   "transcript": [
    {
     "id": "tr-econ-1",
     "timestamp_seconds": 0,
     "time_str": "00:00",
     "text": "Welcome social science students. Today we explore National Income Accounting."
    }
   ]
  },
  "document_attachments": [
   {
    "id": "doc-econ-101-slides",
    "title": "National Income Accounting Summary (PPTX)",
    "type": "pptx",
    "url": "https://victoryacademy.edu.et/materials/g12/econ/GDP-Slides.pptx",
    "file_size_bytes": 2900000,
    "page_or_slide_count": 4,
    "estimated_minutes": 15,
    "description": "Circular flow diagrams, value added tables, and GDP deflator formulas.",
    "slides": [
     {
      "slide_number": 1,
      "title": "The Circular Flow of Economic Activity",
      "key_points": [
       "Households and firms interaction",
       "Factor markets vs product markets"
      ]
     }
    ]
   }
  ],
  "flashcard_deck": [
   {
    "id": "fc-econ-1",
    "question": "What is the formula for GDP under the expenditure approach?",
    "answer": "GDP = C + I + G + (X - M)",
    "explanation": "Consumption + Investment + Government Spending + (Exports - Imports).",
    "difficulty": "Easy",
    "source_module_id": "mod-econ-101",
    "source_section": "1. The Expenditure Approach",
    "tags": [
     "GDP",
     "Formula"
    ]
   }
  ],
  "quiz": {
   "id": "quiz-econ-101",
   "title": "Economics Check: National Income Fundamentals",
   "duration_minutes": 10,
   "passing_score_percentage": 70,
   "questions": [
    {
     "id": "q-econ-1",
     "type": "multiple_choice",
     "question": "Which of the following is EXCLUDED from GDP calculation?",
     "options": [
      "Purchase of a newly built apartment",
      "Government unemployment benefit transfers",
      "Legal consultation services",
      "Exports of agricultural products"
     ],
     "correct_answers": [
      1
     ],
     "explanation": "Transfer payments (like unemployment benefits) involve no exchange for newly produced goods or services.",
     "difficulty": "Medium",
     "topic_tag": "Exclusions"
    }
   ]
  },
  "resources": [],
  "resource_access": {},
  "referral_unlock": {
   "enabled": false,
   "required_referrals": 2
  },
  "created_at": "2026-09-01T08:00:00Z",
  "updated_at": "2026-10-01T08:00:00Z"
 }
];

export const SEED_PROGRESS: StudentProgress = {
 "overall_completion_percentage": 42,
 "study_streak_days": 6,
 "total_minutes_studied": 310,
 "completed_module_ids": [
  "mod-math-101"
 ],
 "module_progress": {
  "mod-math-101": {
   "read_percentage": 100,
   "video_time_seconds": 1140,
   "video_completed": true,
   "document_current_page": 6,
   "document_completed": true,
   "completed": true,
   "last_studied_at": "2026-10-09T18:30:00Z"
  },
  "mod-math-102": {
   "read_percentage": 65,
   "video_time_seconds": 450,
   "video_completed": false,
   "document_current_page": 2,
   "document_completed": false,
   "completed": false,
   "last_studied_at": "2026-10-10T00:15:00Z"
  }
 },
 "quiz_attempts": [
  {
   "id": "qa-1",
   "module_id": "mod-math-101",
   "quiz_id": "quiz-math-101",
   "score": 5,
   "total_questions": 5,
   "percentage": 100,
   "passed": true,
   "completed_at": "2026-10-09T19:00:00Z",
   "weak_topics": []
  }
 ],
 "flashcard_progress": {
  "mod-math-101": {
   "deck_module_id": "mod-math-101",
   "mastered_ids": [
    "fc-101-1",
    "fc-101-2",
    "fc-101-4"
   ],
   "struggling_ids": [
    "fc-101-3",
    "fc-101-5"
   ],
   "last_reviewed_at": "2026-10-09T19:15:00Z",
   "recall_rate": 80
  }
 },
 "recent_module_id": "mod-math-101"
};
