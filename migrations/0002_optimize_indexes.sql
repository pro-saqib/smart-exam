CREATE INDEX IF NOT EXISTS `mcq_subject_id_idx` ON `mcq` (`subject_id`, `id`);
CREATE INDEX IF NOT EXISTS `attempt_user_mcq_idx` ON `attempt` (`user_id`, `mcq_id`);
CREATE INDEX IF NOT EXISTS `solve_later_user_mcq_idx` ON `solve_later` (`user_id`, `mcq_id`);
