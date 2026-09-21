CREATE TABLE `paper_completion` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subject_key` text NOT NULL,
	`paper_number` integer NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`total_questions` integer DEFAULT 0 NOT NULL,
	`accuracy` integer DEFAULT 0 NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `paper_completion_user_idx` ON `paper_completion` (`user_id`);--> statement-breakpoint
CREATE INDEX `paper_completion_user_subject_idx` ON `paper_completion` (`user_id`,`subject_key`);--> statement-breakpoint
CREATE INDEX `paper_completion_lookup_idx` ON `paper_completion` (`user_id`,`subject_key`,`paper_number`);