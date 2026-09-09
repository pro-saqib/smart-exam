CREATE TABLE `solve_later` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mcq_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mcq_id`) REFERENCES `mcq`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `solve_later_user_idx` ON `solve_later` (`user_id`);--> statement-breakpoint
CREATE INDEX `solve_later_mcq_idx` ON `solve_later` (`mcq_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'user' NOT NULL;