-- Mensagem padrao de manutencao com a acentuacao correta.
ALTER TABLE "SystemSetting"
  ALTER COLUMN "maintenanceMessage" SET DEFAULT 'Estamos em manutenção. Volte em alguns minutos.';

UPDATE "SystemSetting"
SET "maintenanceMessage" = 'Estamos em manutenção. Volte em alguns minutos.'
WHERE "maintenanceMessage" = 'Estamos em manutencao. Volte em alguns minutos.';
