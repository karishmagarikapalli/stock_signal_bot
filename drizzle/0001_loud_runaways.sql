CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signalId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`priority` enum('min','low','default','high','max') NOT NULL DEFAULT 'default',
	`notificationService` varchar(50) NOT NULL DEFAULT 'ntfy',
	`ntfyTopic` varchar(255),
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`delivered` boolean NOT NULL DEFAULT true,
	`deliveryError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `apiRateLimits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apiName` varchar(50) NOT NULL,
	`requestsToday` int NOT NULL DEFAULT 0,
	`requestsThisMinute` int NOT NULL DEFAULT 0,
	`dailyLimit` int NOT NULL,
	`minuteLimit` int NOT NULL,
	`lastResetDay` timestamp NOT NULL DEFAULT (now()),
	`lastResetMinute` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apiRateLimits_id` PRIMARY KEY(`id`),
	CONSTRAINT `apiRateLimits_apiName_unique` UNIQUE(`apiName`)
);
--> statement-breakpoint
CREATE TABLE `newsItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(255) NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`content` text,
	`url` varchar(500) NOT NULL,
	`sourceId` int NOT NULL,
	`publishedAt` timestamp NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`sentimentScore` decimal(3,2),
	`sentimentSource` varchar(50),
	`keywords` json,
	`entities` json,
	`isProcessed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `newsItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `newsItems_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `newsSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` varchar(500) NOT NULL,
	`category` varchar(50) NOT NULL,
	`reliabilityScore` decimal(3,2) DEFAULT '0.8',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `newsSources_id` PRIMARY KEY(`id`),
	CONSTRAINT `newsSources_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `signalHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signalId` int NOT NULL,
	`stockSymbol` varchar(10) NOT NULL,
	`signalType` enum('BUY','SELL','HOLD') NOT NULL,
	`priceAtSignal` decimal(10,2) NOT NULL,
	`priceAfter1h` decimal(10,2),
	`priceAfter24h` decimal(10,2),
	`priceAfter7d` decimal(10,2),
	`returnPercent1h` decimal(6,2),
	`returnPercent24h` decimal(6,2),
	`returnPercent7d` decimal(6,2),
	`isAccurate` boolean,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signalHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stockId` int NOT NULL,
	`signalType` enum('BUY','SELL','HOLD') NOT NULL,
	`confidence` decimal(3,2) NOT NULL,
	`sources` json NOT NULL,
	`newsItemIds` json,
	`reasoning` text,
	`sentimentAverage` decimal(3,2),
	`priceAtSignal` decimal(10,2),
	`isAlerted` boolean NOT NULL DEFAULT false,
	`alertSentAt` timestamp,
	`isDuplicate` boolean NOT NULL DEFAULT false,
	`duplicateOfId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(10) NOT NULL,
	`name` varchar(255) NOT NULL,
	`sector` varchar(100),
	`industry` varchar(100),
	`marketCap` varchar(50),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `stocks_symbol_unique` UNIQUE(`symbol`)
);
