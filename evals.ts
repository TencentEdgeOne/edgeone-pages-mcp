//evals.ts

import { EvalConfig } from 'mcp-evals';
import { openai } from "@ai-sdk/openai";
import { grade, EvalFunction } from "mcp-evals";

const deploy_htmlEval: EvalFunction = {
    name: 'deploy_html Tool Evaluation',
    description: 'Tests the deployment of HTML content to EdgeOne Pages, returning the public URL',
    run: async () => {
        const result = await grade(openai("gpt-4"), "Deploy the following HTML to EdgeOne: <html><body><h1>Hello EdgeOne!</h1></body></html> Return the public URL.");
        return JSON.parse(result);
    }
};

const deploy_folder_or_zipEval: EvalFunction = {
    name: 'deploy_folder_or_zip Tool Evaluation',
    description: 'Evaluates the deployment of a folder or zip to EdgeOne Pages and retrieving the public URL',
    run: async () => {
        const result = await grade(openai("gpt-4"), "Deploy the folder located at './my-website-folder' using the deploy_folder_or_zip tool and share the resulting public URL.");
        return JSON.parse(result);
    }
};

const config: EvalConfig = {
    model: openai("gpt-4"),
    evals: [deploy_htmlEval, deploy_folder_or_zipEval]
};
  
export default config;
  
export const evals = [deploy_htmlEval, deploy_folder_or_zipEval];