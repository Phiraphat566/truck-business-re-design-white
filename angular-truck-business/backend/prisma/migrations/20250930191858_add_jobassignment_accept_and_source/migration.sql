-- เพิ่มคอลัมน์ใหม่
ALTER TABLE `JobAssignment`
  ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN `accepted_at` DATETIME NULL;

-- ลบคอลัมน์เก่า
ALTER TABLE `JobAssignment`
  DROP COLUMN `status`;
