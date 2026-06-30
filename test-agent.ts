import * as dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testAgent() {
  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: `You are an agent. First explain your plan. Then call the tool. Then output JSON.`,
      tools: [{
        functionDeclarations: [
          {
            name: 'get_weather',
            description: 'Get weather for location',
            parameters: {
              type: Type.OBJECT,
              properties: { location: { type: Type.STRING } }
            }
          }
        ]
      }]
    }
  });

  console.log("Sending initial message...");
  let response = await chat.sendMessage({ text: "What is the weather in Paris?" } as any);
  console.log("Response text:", response.text);
  console.log("Function calls:", response.functionCalls);

  if (response.functionCalls && response.functionCalls.length > 0) {
     const call = response.functionCalls[0];
     response = await chat.sendMessage([{
       functionResponse: {
         id: call.id || '',
         name: call.name,
         response: { temp: '25C', condition: 'Sunny' }
       }
     }]);
     console.log("Final text:", response.text);
  }
}

testAgent().catch(console.error);
