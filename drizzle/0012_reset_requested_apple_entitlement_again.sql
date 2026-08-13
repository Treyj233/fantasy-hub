UPDATE `subscriptions`
SET `plan` = 'free',
    `status` = 'canceled',
    `current_period_end` = NULL,
    `updated_at` = CURRENT_TIMESTAMP
WHERE lower(`email`) = lower('Jordan.jackson@wtwco.com')
  AND `provider` IN ('apple', 'app_store');
