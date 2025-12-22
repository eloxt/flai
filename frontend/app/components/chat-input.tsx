import { ArrowUpIcon, Globe, Paperclip } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import TextareaAutosize from 'react-textarea-autosize';

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    isLoading?: boolean;
    placeholder?: string;
    className?: string;
    onHeightChange?: (height: number) => void;
}

export function ChatInput({
    value,
    onChange,
    onSend,
    isLoading = false,
    placeholder,
    className,
    onHeightChange
}: ChatInputProps) {
    const { t } = useTranslation();

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    return (
        <InputGroup className={`${className || ""}`}>
            <TextareaAutosize
                data-slot="input-group-control"
                placeholder={placeholder || t("placeholder")}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onHeightChange={onHeightChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                maxRows={7}
                minRows={1}
                className="flex field-sizing-content w-full resize-none rounded-md bg-transparent px-3 py-2.5 text-base transition-all outline-none md:text-sm"
            />
            <InputGroupAddon align="block-end">
                <ToggleGroup type="multiple" spacing={2} >
                    <ToggleGroupItem
                        value="attachment"
                        variant="outline"
                        className="rounded-xl"
                    >
                        <Paperclip />
                        {t("attachment")}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="search"
                        variant="outline"
                        className="rounded-xl"
                    >
                        <Globe />
                        {t("search")}
                    </ToggleGroupItem>
                </ToggleGroup>
                <InputGroupButton
                    variant="default"
                    className="rounded-full ml-auto"
                    size="icon-xs"
                    onClick={onSend}
                    disabled={isLoading || !value.trim()}
                >
                    <ArrowUpIcon />
                </InputGroupButton>
            </InputGroupAddon>
        </InputGroup>
    );
}
