CREATE TABLE `wa_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`phone` text NOT NULL,
	`lid` text,
	`jid` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`otp_code` text,
	`otp_expires_at` integer,
	`otp_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_phone_unique` ON `wa_bindings` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_lid_unique` ON `wa_bindings` (`lid`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_jid_unique` ON `wa_bindings` (`jid`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_user_id_idx` ON `wa_bindings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_phone_idx` ON `wa_bindings` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_lid_idx` ON `wa_bindings` (`lid`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_jid_idx` ON `wa_bindings` (`jid`);--> statement-breakpoint
CREATE TABLE `wa_signal_keys` (
	`type` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`type`, `key`)
);
