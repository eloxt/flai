UPDATE "setting"
SET "value" = jsonb_set("value", '{chat}', to_jsonb(replace("value"->>'chat', '{{currentDateTime}}', '{{currentDate}}')))
WHERE "key" = 'system_prompt' AND "value"->>'chat' LIKE '%{{currentDateTime}}%';
