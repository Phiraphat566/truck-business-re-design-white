/*
  Warnings:

  - The primary key for the `JobAssignment` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `job_id` on the `JobAssignment` table. All the data in the column will be lost.
  - The required column `id` was added to the `JobAssignment` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE `JobAssignment` DROP FOREIGN KEY `JobAssignment_ibfk_1`;

-- DropForeignKey
ALTER TABLE `Trip` DROP FOREIGN KEY `Trip_ibfk_1`;

-- AlterTable
ALTER TABLE `JobAssignment` DROP PRIMARY KEY,
    DROP COLUMN `job_id`,
    ADD COLUMN `id` VARCHAR(191) NOT NULL,
    MODIFY `source` VARCHAR(20) NOT NULL DEFAULT 'LINE',
    ADD PRIMARY KEY (`id`);

-- AddForeignKey
ALTER TABLE `JobAssignment` ADD CONSTRAINT `JobAssignment_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_ibfk_1` FOREIGN KEY (`job_id`) REFERENCES `JobAssignment`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
