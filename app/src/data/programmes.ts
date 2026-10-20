export const featuredProgramme = {
  slug: "computing",
  name: "Bachelor of Science in Computing",
  category: "Computing & Technology",
  status: "available" as const,
  blurb:
    "From programming and databases to artificial intelligence, build your understanding one module at a time.",
  blurbShort: "Modules, quizzes and AI study tools.",
  duration: "4-year programme",
  format: "Semester-based learning",
  href: "/programmes/computing",
};

export const studyProgrammes = [
  { slug: "computing", name: "Bachelor of Science in Computing", available: true },
  { slug: "bac", name: "Bachelor of Accounting (BAC)", available: false },
  { slug: "ba-bf", name: "Bachelor of Arts in Banking and Finance", available: false },
  { slug: "llb", name: "Bachelor of Laws (LLB)", available: false },
  { slug: "bba", name: "Bachelor of Business Administration (BBA)", available: false },
  { slug: "project-management", name: "Project Management", available: false },
  { slug: "clinical", name: "Clinical Sciences", available: false },
  { slug: "nursing", name: "Nursing", available: false },
  { slug: "mbchb", name: "Bachelor of Medicine and Surgery (MBChB)", available: false },
] as const;

export type StudyProgramme = (typeof studyProgrammes)[number];

export function programmeBySlug(slug: string) {
  return studyProgrammes.find((item) => item.slug === slug);
}

export function programmeByName(name: string) {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return studyProgrammes.find((item) => item.name.toLowerCase() === needle);
}

export const upcomingGroups = [
  {
    title: "Accounting & Finance",
    hint: "BAC · BA BF",
    blurb: "Numbers, business and financial thinking.",
    glow: "#3444DA",
  },
  {
    title: "Law",
    hint: "LLB",
    blurb: "Build knowledge through legal reasoning.",
    glow: "#7B5CFF",
  },
  {
    title: "Business & Management",
    hint: "BBA · Project Management",
    blurb: "Explore management, enterprise and strategy.",
    glow: "#E85D9A",
  },
  {
    title: "Health Sciences",
    hint: "Clinical · Nursing · MBChB",
    blurb: "Prepare for a future in health and medicine.",
    glow: "#1FA971",
  },
] as const;

export const computingMeta = {
  kicker: "Degree programme",
  title: "BSc in Computing",
  fullName: "Bachelor of Science in Computing",
  years: 4,
  semesters: 8,
  creditsListed: 1290,
  entry:
    "Full Grade 12 certificate with five O-level credits, including Mathematics and English.",
  overview:
    "Exam preparation for Cavendish University Zambia’s Bachelor of Science in Computing — organised by year, semester, and module.",
};

export type ComputingModule = {
  code: string;
  name: string;
};

export const computingModules: Record<string, ComputingModule[]> = {
  "2-1": [
    { code: "IT211", name: "Systems Analysis and Design" },
    { code: "IT212", name: "Database Management Systems" },
    { code: "IT213", name: "Networking and Data Communication I" },
    { code: "IT214", name: "Operating Systems" },
    { code: "IT215", name: "Discrete Mathematics" },
  ],
};
