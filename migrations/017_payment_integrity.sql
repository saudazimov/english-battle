-- Har bir payment/order faqat bitta Payme tranzaksiyasiga bog'lanadi.
-- Bu turli Payme transaction_id lar bilan bir orderni ikki marta bajarishni yopadi.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payme_tx_one_per_payment
  ON payme_transactions(payment_id);
