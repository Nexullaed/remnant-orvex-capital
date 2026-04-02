import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number.")
    .max(20, "Phone number is too long."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/[a-z]/, "Password must include a lowercase letter.")
    .regex(/[A-Z]/, "Password must include an uppercase letter.")
    .regex(/[0-9]/, "Password must include a number."),
});

export const loanApplicationSchema = z.object({
  principal: z
    .string()
    .trim()
    .refine((value) => value !== "", "Principal amount is required.")
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value), "Enter a valid numeric amount.")
    .refine((value) => value >= 10000, "Minimum loan amount is 10,000 MWK."),
  duration_days: z.enum(["7", "14", "21", "30"], {
    errorMap: () => ({ message: "Choose one of the approved loan durations." }),
  }),
});
