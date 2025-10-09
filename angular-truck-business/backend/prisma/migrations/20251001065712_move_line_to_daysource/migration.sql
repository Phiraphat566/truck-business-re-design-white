/*
  Warnings:

  - The values [LINE] on the enum `EmployeeDayStatus_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `EmployeeDayStatus` MODIFY `status` ENUM('NOT_CHECKED_IN', 'WORKING', 'OFF_DUTY', 'ON_LEAVE', 'ABSENT') NOT NULL,
    MODIFY `source` ENUM('SYSTEM', 'ATTENDANCE', 'LEAVE', 'MANUAL', 'LINE') NOT NULL DEFAULT 'SYSTEM';
