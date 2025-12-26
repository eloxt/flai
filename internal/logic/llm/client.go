package llm

import (
	"context"
	"encoding/json"
	"flai/internal/consts"
	"flai/internal/logic"
	"flai/internal/model/entity"
	"fmt"
	"strings"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/util/gconv"
)

type Client interface {
	StreamChat(ctx context.Context, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string) error
	GenerateTitle(ctx context.Context, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, systemInstruction string, content string) (*TitleGenerationResponse, error)
}

func StreamChat(ctx context.Context, response *ghttp.Response, providerInfo *logic.SimpleProviderInfo, modelConfig *logic.ModelConfig, historyMessages []*entity.Message, newMessage *entity.Message, tools []string) error {
	var client Client
	switch providerInfo.ProviderType {
	case consts.ProviderType.OpenAI:
		client = &OpenAIClient{}
	case consts.ProviderType.Gemini:
		client = &GeminiClient{}
	default:
		return gerror.Newf("unsupported provider type: %s", providerInfo.ProviderType)
	}
	return client.StreamChat(ctx, response, providerInfo, modelConfig, historyMessages, newMessage, tools)
}

func GenerateTitle(ctx context.Context, messages []*entity.Message) (*TitleGenerationResponse, error) {
	config, ok := logic.SystemConfigMap[consts.SystemConfig.TitleGeneration]
	if !ok {
		return nil, gerror.New("Title generation config not found")
	}

	providerId := gconv.String(config["provider_id"])
	modelId := gconv.String(config["model_name"])
	template := gconv.String(config["prompt"])

	providerInfo, ok := logic.ProviderMap[providerId]
	if !ok {
		return nil, gerror.New("Provider not found")
	}

	modelConfig, ok := providerInfo.ModelIdMap[modelId]
	if !ok {
		return nil, gerror.New("Model not found")
	}

	sb := strings.Builder{}
	sb.WriteString("<chat_history>\n")
	for _, msg := range messages {
		sb.WriteString(fmt.Sprintf("<message role=\"%s\">%s</message>\n", msg.Role, msg.Content))
	}
	sb.WriteString("</chat_history>")
	//sb.WriteString("<output_format>\n")
	//sb.WriteString("<icon>{icon}</icon>\n")
	//sb.WriteString("<title>title</title>\n")
	//sb.WriteString("</output_format>")
	xmlContent := sb.String()

	var client Client
	switch providerInfo.ProviderType {
	case consts.ProviderType.OpenAI:
		client = &OpenAIClient{}
	case consts.ProviderType.Gemini:
		client = &GeminiClient{}
	default:
		return nil, gerror.Newf("unsupported provider type: %s", providerInfo.ProviderType)
	}

	return client.GenerateTitle(ctx, providerInfo, modelConfig, template, xmlContent)
}

func StreamToClient(response *ghttp.Response, content any) error {
	data, err := json.Marshal(content)
	if err != nil {
		return err
	}
	response.Writef("data: %s\n\n", data)
	response.Flush()
	return nil
}

func appendContent(contentBuilder *strings.Builder, messageType string, contentList *[]Content) {
	if contentBuilder.Len() == 0 {
		return
	}
	val := contentBuilder.String()
	if messageType == consts.MessageType.Reasoning {
		data := ContentReasoning{Content: val}
		content := Content{Type: consts.MessageType.Reasoning, Data: data}
		*contentList = append(*contentList, content)
	} else {
		data := ContentMessage{Content: val}
		content := Content{Type: consts.MessageType.Message, Data: data}
		*contentList = append(*contentList, content)
	}
}
