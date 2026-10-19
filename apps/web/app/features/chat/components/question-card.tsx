import type { AskUserAnswer, AskUserQuestion } from "@flai/shared"
import { isMultiSelect } from "@flai/shared"
import { CheckIcon, ChevronRightIcon, CircleHelpIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Textarea } from "~/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"

interface QuestionCardProps {
  question: AskUserQuestion
  answer?: AskUserAnswer
  toolCallId: string
  onAnswer?: (toolCallId: string, answer: AskUserAnswer) => Promise<boolean>
}

export function QuestionCard({
  question,
  answer,
  toolCallId,
  onAnswer,
}: QuestionCardProps) {
  const { t } = useTranslation()
  const id = useId()
  const answered = answer !== undefined
  const [open, setOpen] = useState(!answered)
  const [selected, setSelected] = useState<string[]>([])
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const options = question.options ?? []
  const multiple = isMultiSelect(question)
  const disabled = !onAnswer || submitting
  const summary = Array.isArray(answer) ? answer.join(", ") : answer

  useEffect(() => setOpen(!answered), [answered])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="w-full rounded-lg border"
    >
      <CollapsibleTrigger
        ref={triggerRef}
        className="group/question flex w-full items-start gap-2 rounded-lg px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-ring"
      >
        {answered ? (
          <CheckIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
        ) : (
          <CircleHelpIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
        )}
        <span className="min-w-0 flex-1 text-sm leading-5">
          <span id={`${id}-question`} className="block font-medium">
            {question.question}
          </span>
          {answered && (
            <>
              {" "}
              <span className="mt-1 block truncate text-muted-foreground">
                {summary}
              </span>
            </>
          )}
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground group-data-[panel-open]/question:rotate-90 motion-safe:transition-transform"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {answered ? (
          <div
            className="border-t px-4 py-3 text-sm whitespace-pre-wrap"
            aria-label={t("pages.chat.question.yourAnswer")}
          >
            {summary}
          </div>
        ) : (
          <form
            aria-labelledby={`${id}-question`}
            className="border-t p-4"
            onSubmit={async (event) => {
              event.preventDefault()
              if (
                disabled ||
                submittingRef.current ||
                (!text.trim() && selected.length === 0)
              )
                return
              const value = multiple
                ? [
                    ...new Set([
                      ...selected,
                      ...(text.trim() ? [text.trim()] : []),
                    ]),
                  ]
                : text.trim() || selected[0]!
              submittingRef.current = true
              setSubmitting(true)
              try {
                if (await onAnswer?.(toolCallId, value)) {
                  setOpen(false)
                  triggerRef.current?.focus()
                }
              } finally {
                submittingRef.current = false
                setSubmitting(false)
              }
            }}
          >
            <FieldGroup className="gap-4">
              {options.length > 0 && (
                <Field>
                  {multiple && (
                    <FieldDescription>
                      {t("pages.chat.question.chooseMultiple")}
                    </FieldDescription>
                  )}
                  <ToggleGroup
                    aria-labelledby={`${id}-question`}
                    variant="outline"
                    orientation="vertical"
                    className="w-full"
                    multiple={multiple}
                    disabled={disabled}
                    value={selected}
                    onValueChange={(value) => {
                      setSelected(value)
                      if (!multiple) setText("")
                    }}
                  >
                    {options.map((option) => (
                      <ToggleGroupItem
                        key={option.label}
                        value={option.label}
                        className="h-auto min-h-10 justify-start py-2 text-left whitespace-normal"
                      >
                        <span className="flex flex-col gap-0.5">
                          <span>{option.label}</span>
                          {option.description && (
                            <>
                              {" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {option.description}
                              </span>
                            </>
                          )}
                        </span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              )}
              <Field data-disabled={disabled}>
                <FieldLabel htmlFor={`${id}-answer`}>
                  {t(
                    options.length
                      ? "pages.chat.question.otherAnswer"
                      : "pages.chat.question.yourAnswer"
                  )}
                </FieldLabel>
                <Textarea
                  id={`${id}-answer`}
                  value={text}
                  maxLength={multiple ? 2000 : 20_000}
                  disabled={disabled}
                  placeholder={t("pages.chat.question.placeholder")}
                  onChange={(event) => {
                    setText(event.target.value)
                    if (!multiple) setSelected([])
                  }}
                />
              </Field>
              <Field orientation="horizontal" className="justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={disabled || (!text.trim() && selected.length === 0)}
                >
                  {t(
                    submitting
                      ? "pages.chat.question.submitting"
                      : "pages.chat.question.submit"
                  )}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
