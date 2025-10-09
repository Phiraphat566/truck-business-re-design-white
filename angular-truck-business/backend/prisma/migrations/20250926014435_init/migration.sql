-- CreateTable
CREATE TABLE `Employee` (
    `employee_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `position` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(50) NOT NULL,
    `email` VARCHAR(255) NULL,
    `profile_image_path` VARCHAR(255) NULL,

    PRIMARY KEY (`employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
    `attendance_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `work_date` DATE NOT NULL,
    `check_in` DATETIME(0) NOT NULL,
    `check_out` DATETIME(0) NULL,
    `status` ENUM('ON_TIME', 'LATE') NOT NULL,

    INDEX `Attendance_employee_id_work_date_idx`(`employee_id`, `work_date`),
    UNIQUE INDEX `uq_att_once_per_day`(`employee_id`, `work_date`),
    PRIMARY KEY (`attendance_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobAssignment` (
    `job_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `job_description` TEXT NOT NULL,
    `assigned_date` DATETIME(0) NOT NULL,
    `status` VARCHAR(100) NOT NULL,

    INDEX `employee_id`(`employee_id`),
    PRIMARY KEY (`job_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Truck` (
    `truck_id` VARCHAR(36) NOT NULL,
    `plate` VARCHAR(50) NOT NULL,
    `model` VARCHAR(100) NULL,
    `total_distance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `fuel_efficiency_km_per_liter` DECIMAL(10, 2) NULL,
    `current_driver_id` VARCHAR(191) NULL,

    INDEX `Truck_current_driver_id_idx`(`current_driver_id`),
    UNIQUE INDEX `uq_truck_plate`(`plate`),
    PRIMARY KEY (`truck_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TruckDriverAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `truck_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `start_at` DATETIME(0) NOT NULL,
    `end_at` DATETIME(0) NULL,

    INDEX `TruckDriverAssignment_truck_id_start_at_idx`(`truck_id`, `start_at`),
    INDEX `TruckDriverAssignment_truck_id_end_at_idx`(`truck_id`, `end_at`),
    INDEX `TruckDriverAssignment_employee_id_start_at_idx`(`employee_id`, `start_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Trip` (
    `trip_id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `truck_id` VARCHAR(191) NOT NULL,
    `distance_km` INTEGER NOT NULL,
    `trip_date` DATE NOT NULL,
    `fuel_used_liters` DECIMAL(10, 2) NULL,

    INDEX `job_id`(`job_id`),
    INDEX `truck_id`(`truck_id`),
    INDEX `idx_trip_date`(`trip_date`),
    PRIMARY KEY (`trip_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FuelLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `truck_id` VARCHAR(191) NOT NULL,
    `fuel_date` DATE NOT NULL,
    `round_number` INTEGER NOT NULL DEFAULT 1,
    `liters` DECIMAL(10, 2) NOT NULL,
    `cost` DECIMAL(12, 2) NOT NULL,
    `price_per_liter` DECIMAL(10, 2) NULL,

    INDEX `idx_fuellog_truck`(`truck_id`),
    INDEX `idx_fuellog_date`(`fuel_date`),
    UNIQUE INDEX `uq_fuellog_truck_date_round`(`truck_id`, `fuel_date`, `round_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TruckDistanceLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `truck_id` VARCHAR(191) NOT NULL,
    `log_date` DATE NOT NULL,
    `round_number` INTEGER NOT NULL DEFAULT 1,
    `distance_km` DECIMAL(10, 2) NOT NULL,

    INDEX `idx_truckdist_truck`(`truck_id`),
    UNIQUE INDEX `uq_dist_truck_date_round`(`truck_id`, `log_date`, `round_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TruckExpense` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `truck_id` VARCHAR(191) NOT NULL,
    `expense_date` DATE NOT NULL,
    `description` TEXT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,

    INDEX `truck_id`(`truck_id`),
    INDEX `idx_truckexpense_date`(`expense_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeCall` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` VARCHAR(191) NOT NULL,
    `call_date` DATE NOT NULL,
    `message` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `employee_id`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeMonthlySummary` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `planned_days` INTEGER NOT NULL DEFAULT 0,
    `present_days` INTEGER NOT NULL DEFAULT 0,
    `late_days` INTEGER NOT NULL DEFAULT 0,
    `absent_days` INTEGER NOT NULL DEFAULT 0,
    `leave_days` INTEGER NOT NULL DEFAULT 0,
    `work_hours` DECIMAL(10, 2) NULL,
    `on_time_rate` DECIMAL(5, 2) NULL,

    INDEX `idx_empms_year_month`(`year`, `month`),
    UNIQUE INDEX `uq_employee_month`(`employee_id`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinanceMonthlySummary` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `income_received` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `expense_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `net_profit` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `invoice_paid_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `invoice_pending_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `invoice_overdue_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `invoice_count` INTEGER NOT NULL DEFAULT 0,
    `paid_count` INTEGER NOT NULL DEFAULT 0,
    `pending_count` INTEGER NOT NULL DEFAULT 0,
    `overdue_count` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_finance_month`(`year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TravelCost` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `min_km` INTEGER NOT NULL,
    `max_km` INTEGER NULL,
    `price_per_round` DECIMAL(10, 2) NOT NULL,
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `note` VARCHAR(255) NULL,

    INDEX `TravelCost_effective_from_effective_to_idx`(`effective_from`, `effective_to`),
    INDEX `TravelCost_min_km_max_km_idx`(`min_km`, `max_km`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Income` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receiptNo` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NULL,
    `contractDate` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PENDING', 'OVERDUE', 'PAID', 'PARTIAL') NOT NULL DEFAULT 'PENDING',
    `receivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `description` TEXT NULL,
    `category` VARCHAR(100) NULL,
    `contract_image_path` VARCHAR(255) NULL,

    UNIQUE INDEX `Income_receiptNo_key`(`receiptNo`),
    INDEX `idx_income_contractDate`(`contractDate`),
    INDEX `idx_income_dueDate`(`dueDate`),
    INDEX `idx_income_status`(`status`),
    INDEX `idx_income_createdAt`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceNo` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `contractDate` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PENDING', 'OVERDUE', 'PAID', 'PARTIAL') NOT NULL DEFAULT 'PENDING',
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `description` TEXT NULL,

    UNIQUE INDEX `Invoice_invoiceNo_key`(`invoiceNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payment_date` DATE NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `description` VARCHAR(191) NULL,
    `category` VARCHAR(50) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `invoice_id` INTEGER NULL,
    `income_id` INTEGER NULL,

    INDEX `idx_payment_invoice`(`invoice_id`),
    INDEX `idx_payment_income`(`income_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Staff` (
    `staff_id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'staff',
    `profile_image_path` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `Staff_username_key`(`username`),
    PRIMARY KEY (`staff_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeDayStatus` (
    `employee_id` VARCHAR(191) NOT NULL,
    `work_date` DATE NOT NULL,
    `status` ENUM('NOT_CHECKED_IN', 'WORKING', 'OFF_DUTY', 'ON_LEAVE', 'ABSENT') NOT NULL,
    `source` ENUM('SYSTEM', 'ATTENDANCE', 'LEAVE', 'MANUAL') NOT NULL DEFAULT 'SYSTEM',
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `arrival_detail` ENUM('ON_TIME', 'LATE') NULL,

    INDEX `EmployeeDayStatus_status_idx`(`status`),
    INDEX `idx_eds_work_date`(`work_date`),
    INDEX `EmployeeDayStatus_source_idx`(`source`),
    INDEX `EmployeeDayStatus_arrival_detail_idx`(`arrival_detail`),
    PRIMARY KEY (`employee_id`, `work_date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequest` (
    `leave_id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` VARCHAR(191) NOT NULL,
    `leave_date` DATE NOT NULL,
    `leave_type` VARCHAR(20) NOT NULL,
    `reason` TEXT NULL,
    `approved_by` INTEGER NOT NULL,
    `approved_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `LeaveRequest_employee_id_leave_date_idx`(`employee_id`, `leave_date`),
    UNIQUE INDEX `LeaveRequest_employee_id_leave_date_key`(`employee_id`, `leave_date`),
    PRIMARY KEY (`leave_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkYear` (
    `year` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceYear` (
    `year` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncomeYear` (
    `year` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `JobAssignment` ADD CONSTRAINT `JobAssignment_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Truck` ADD CONSTRAINT `Truck_current_driver_id_fkey` FOREIGN KEY (`current_driver_id`) REFERENCES `Employee`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TruckDriverAssignment` ADD CONSTRAINT `TruckDriverAssignment_truck_id_fkey` FOREIGN KEY (`truck_id`) REFERENCES `Truck`(`truck_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TruckDriverAssignment` ADD CONSTRAINT `TruckDriverAssignment_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_ibfk_1` FOREIGN KEY (`job_id`) REFERENCES `JobAssignment`(`job_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_ibfk_2` FOREIGN KEY (`truck_id`) REFERENCES `Truck`(`truck_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `FuelLog` ADD CONSTRAINT `FuelLog_ibfk_1` FOREIGN KEY (`truck_id`) REFERENCES `Truck`(`truck_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `TruckDistanceLog` ADD CONSTRAINT `TruckDistanceLog_ibfk_1` FOREIGN KEY (`truck_id`) REFERENCES `Truck`(`truck_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `TruckExpense` ADD CONSTRAINT `TruckExpense_ibfk_1` FOREIGN KEY (`truck_id`) REFERENCES `Truck`(`truck_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `EmployeeCall` ADD CONSTRAINT `EmployeeCall_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `EmployeeMonthlySummary` ADD CONSTRAINT `EmployeeMonthlySummary_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_income_id_fkey` FOREIGN KEY (`income_id`) REFERENCES `Income`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeDayStatus` ADD CONSTRAINT `EmployeeDayStatus_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `Staff`(`staff_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
