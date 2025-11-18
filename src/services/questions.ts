export const QUESTIONS = [
  { id: "q1", text: "Что для тебя идеальное свидание?" },
  { id: "q2", text: "С кем из исторических личностей ты бы поужинал(а)?" },
  { id: "q3", text: "Горы или море? Почему?" },
  { id: "q4", text: "Какая песня всегда поднимает тебе настроение?" },
];

export function getDailyQuestionId(date = new Date()) {
  const base = new Date("2025-01-01");
  const days = Math.floor(
    (date.getTime() - base.getTime()) / (1000 * 60 * 60 * 24),
  );
  const idx = days % QUESTIONS.length;
  return QUESTIONS[idx].id;
}
