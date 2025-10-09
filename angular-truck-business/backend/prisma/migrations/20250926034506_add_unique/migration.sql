/*
  Warnings:

  - A unique constraint covering the columns `[current_driver_id]` on the table `Truck` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Truck_current_driver_id_key` ON `Truck`(`current_driver_id`);
