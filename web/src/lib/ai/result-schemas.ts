import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
export const referenceSchema = z.object({ n: z.number().int(), title: text(240), url: z.string().url().optional(), updated: z.string().optional() });
export type ResultReference = z.infer<typeof referenceSchema>;
export const basisSchema = z.enum(["sources", "user"]);
const evidence = { basis: basisSchema, sourceNumbers: z.array(z.number().int().min(1)).max(12).default([]) };
const provenance = { basis: basisSchema, references: z.array(referenceSchema) };

export const checklistInputSchema = z.object({
  title: text(80), steps: z.array(z.object({ title: text(100), detail: text(500) })).min(1).max(12), ...evidence,
});
export const checklistOutputSchema = checklistInputSchema.omit({ sourceNumbers: true }).extend(provenance);
export type ChecklistData = z.infer<typeof checklistOutputSchema>;

export const studyWordSchema = z.object({
  word: text(80), pronunciation: z.string().max(100).default(""), meaning: text(200),
  example: text(300), translation: text(300), question: text(200),
  options: z.array(text(150)).min(2).max(4), answer: z.number().int().min(0).max(3),
}).refine((word) => word.answer < word.options.length && new Set(word.options).size === word.options.length, "选项不得重复，答案必须指向有效选项");
export const studyInputSchema = z.object({ title: text(80), words: z.array(studyWordSchema).min(1).max(8) });
export type StudyData = z.infer<typeof studyInputSchema>;

export const phoneSchema = z.object({ label: text(40), number: text(32).regex(/^\+?[\d\s()（）-]{5,32}$/, "电话号码格式不正确") });
export const contactInputSchema = z.object({
  name: text(80), organization: z.string().max(100).optional(), phones: z.array(phoneSchema).min(1).max(4),
  address: z.string().max(200).optional(), ...evidence,
});
export const contactOutputSchema = contactInputSchema.omit({ sourceNumbers: true }).extend(provenance);
export type ContactData = z.infer<typeof contactOutputSchema>;

export const examOutputSchema = z.object({
  event: z.object({
    id: text(100), title: text(60), start: text(80), end: z.string().optional(), allDay: z.boolean(),
    location: z.string().optional(), notes: z.string().optional(), kind: z.literal("exam"),
  }),
  checklist: z.array(text(150)).max(12), ...provenance,
});
export type ExamData = z.infer<typeof examOutputSchema>;
