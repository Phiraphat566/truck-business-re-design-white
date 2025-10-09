-- DropForeignKey
ALTER TABLE `JobAssignment` DROP FOREIGN KEY `JobAssignment_ibfk_1`;

-- AlterTable
ALTER TABLE `JobAssignment` ADD COLUMN `completed_at` DATETIME(0) NULL,
    ADD COLUMN `completed_by` INTEGER NULL,
    ADD COLUMN `completed_note` VARCHAR(255) NULL;

-- AddForeignKey
ALTER TABLE `JobAssignment` ADD CONSTRAINT `JobAssignment_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `JobAssignment` RENAME INDEX `employee_id` TO `JobAssignment_employee_id_idx`;
