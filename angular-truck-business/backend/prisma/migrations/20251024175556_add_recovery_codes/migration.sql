-- CreateTable
CREATE TABLE `StaffRecoveryCode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staff_id` INTEGER NOT NULL,
    `code_hash` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `used_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,

    INDEX `StaffRecoveryCode_staff_id_used_at_idx`(`staff_id`, `used_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StaffRecoveryCode` ADD CONSTRAINT `StaffRecoveryCode_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `Staff`(`staff_id`) ON DELETE CASCADE ON UPDATE CASCADE;
