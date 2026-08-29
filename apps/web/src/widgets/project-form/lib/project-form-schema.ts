import * as z from "zod"

export const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required.")
    .max(200, "Project name must be at most 200 characters."),
  description: z.string().trim(),
  supabaseUrl: z.url({
    protocol: /^https?$/,
    error: "Enter a valid http or https URL.",
  }),
  publishableKey: z
    .string()
    .trim()
    .min(1, "Publishable key is required.")
    .max(500, "Publishable key must be at most 500 characters."),
  enabled: z.boolean(),
})

export type ProjectFormValues = z.infer<typeof projectFormSchema>
