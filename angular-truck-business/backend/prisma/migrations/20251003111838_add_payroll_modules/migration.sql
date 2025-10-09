-- CreateTable
CREATE TABLE `PayrollRun` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `title` VARCHAR(255) NULL,
    `note` VARCHAR(255) NULL,
    `status` ENUM('DRAFT', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_payroll_run_ym`(`year`, `month`),
    UNIQUE INDEX `uq_payroll_run_year_month`(`year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payroll_run_id` INTEGER NOT NULL,
    `employee_id` VARCHAR(191) NULL,
    `base_salary` DECIMAL(12, 2) NOT NULL,
    `allowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `overtime` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `deduction` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `net_amount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
    `paid_at` DATE NULL,
    `note` VARCHAR(255) NULL,

    INDEX `idx_payroll_item_emp`(`employee_id`),
    INDEX `idx_payroll_item_paid_at`(`paid_at`),
    UNIQUE INDEX `uq_payroll_item_unique_emp_in_run`(`payroll_run_id`, `employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PayrollRun` ADD CONSTRAINT `PayrollRun_ibfk_year` FOREIGN KEY (`year`) REFERENCES `InvoiceYear`(`year`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollItem` ADD CONSTRAINT `PayrollItem_ibfk_run` FOREIGN KEY (`payroll_run_id`) REFERENCES `PayrollRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollItem` ADD CONSTRAINT `PayrollItem_ibfk_emp` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;
