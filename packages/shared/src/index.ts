import { z } from "zod";

export const roleSchema = z.enum(["user", "editor", "mod", "admin"]);
export type Role = z.infer<typeof roleSchema>;

export const userStatusSchema = z.enum(["active", "suspended", "banned"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const voteTargetTypeSchema = z.enum(["revision", "comment"]);
export type VoteTargetType = z.infer<typeof voteTargetTypeSchema>;

export const moderationActionTypeSchema = z.enum([
  "warn",
  "suspend",
  "ban",
  "revert",
]);
export type ModerationActionType = z.infer<typeof moderationActionTypeSchema>;

export const karmaEventTypeSchema = z.enum([
  "article_created",
  "article_edited",
  "revision_upvoted",
  "revision_downvoted",
  "discussion_comment_created",
  "discussion_comment_upvoted",
  "discussion_comment_downvoted",
  "valid_revert_performed",
  "edit_reverted",
  "policy_warning",
  "policy_suspension",
  "policy_ban",
]);
export type KarmaEventType = z.infer<typeof karmaEventTypeSchema>;

export const karmaConfigSchema = z.object({
  weights: z.record(karmaEventTypeSchema, z.number().int()),
  decay: z.object({
    enabled: z.boolean(),
    graceDays: z.number().int().min(0),
    weeklyRatePct: z.number().min(0).max(100),
    floor: z.number().int(),
  }),
  antiAbuse: z.object({
    dailyLowFrictionPositiveCap: z.number().int().min(0),
    duplicateWindowMinutes: z.number().int().min(0),
  }),
});

export type KarmaConfig = z.infer<typeof karmaConfigSchema>;

export const defaultKarmaConfig: KarmaConfig = {
  weights: {
    article_created: 8,
    article_edited: 4,
    revision_upvoted: 2,
    revision_downvoted: -2,
    discussion_comment_created: 1,
    discussion_comment_upvoted: 1,
    discussion_comment_downvoted: -1,
    valid_revert_performed: 2,
    edit_reverted: -6,
    policy_warning: -10,
    policy_suspension: -25,
    policy_ban: -100,
  },
  decay: {
    enabled: true,
    graceDays: 14,
    weeklyRatePct: 1,
    floor: 0,
  },
  antiAbuse: {
    dailyLowFrictionPositiveCap: 20,
    duplicateWindowMinutes: 60,
  },
};

export const magicLinkRequestSchema = z.object({
  email: z.email(),
});

export const magicLinkVerifySchema = z.object({
  token: z.string().min(16),
});

export const createPasskeySchema = z.object({
  name: z.string().min(1).max(80),
  credentialId: z.string().min(8).max(512),
  publicKey: z.string().min(8).max(4096),
});

export const passkeyLoginSchema = z.object({
  credentialId: z.string().min(8).max(512),
});

export const createArticleSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(3).max(200),
  content: z.string().min(1),
  summary: z.string().max(500).optional(),
});

export const editArticleSchema = z.object({
  content: z.string().min(1),
  summary: z.string().max(500).optional(),
});

export const revertArticleSchema = z.object({
  revisionId: z.number().int().positive(),
  reason: z.string().min(3).max(500),
});

export const createDiscussionThreadSchema = z.object({
  title: z.string().min(3).max(200),
});

export const createDiscussionCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const castVoteSchema = z.object({
  targetType: voteTargetTypeSchema,
  targetId: z.number().int().positive(),
  value: z.union([z.literal(1), z.literal(-1)]),
});

export const moderationActionSchema = z.object({
  targetUserId: z.number().int().positive(),
  actionType: moderationActionTypeSchema,
  reasonType: z.literal("policy_violation"),
  note: z.string().min(3).max(1000),
  suspendHours: z.number().int().positive().optional(),
  articleSlug: z.string().optional(),
  revisionId: z.number().int().positive().optional(),
});

export const updateUserSchema = z.object({
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
});

export type ApiError = {
  error: string;
};
