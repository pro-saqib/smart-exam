ALTER TABLE `subject` ADD `total_mcqs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `attempt_user_mcq_idx` ON `attempt` (`user_id`,`mcq_id`);--> statement-breakpoint
CREATE INDEX `mcq_subject_id_idx` ON `mcq` (`subject_id`,`id`);--> statement-breakpoint
CREATE INDEX `solve_later_user_mcq_idx` ON `solve_later` (`user_id`,`mcq_id`);