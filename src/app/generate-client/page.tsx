"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import yaml from "js-yaml";

// Import Monaco editor dynamically to avoid SSR issues
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false }
);

export default function GenerateClientPage() {
  const [spec, setSpec] = useState<string | null>(null);
  const [specObj, setSpecObj] = useState<Record<string, unknown> | null>(null);
  const [generatedClient, setGeneratedClient] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Fetch the API key from environment variables
  useEffect(() => {
    // In production, this should be set on the server or in .env.local
    const envApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (envApiKey) {
      setApiKey(envApiKey);
    }
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    try {
      const file = acceptedFiles[0];
      if (!file) return;

      const text = await file.text();
      setSpec(text);
      
      try {
        // Try parsing as JSON first
        let parsedSpec: Record<string, unknown>;
        
        if (file.name.endsWith('.json')) {
          parsedSpec = JSON.parse(text);
        } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
          // Parse as YAML
          parsedSpec = yaml.load(text) as Record<string, unknown>;
        } else {
          // Try both formats
          try {
            parsedSpec = JSON.parse(text);
          } catch {
            parsedSpec = yaml.load(text) as Record<string, unknown>;
          }
        }
        
        setSpecObj(parsedSpec);
      } catch (parseError) {
        console.error("Failed to parse file:", parseError);
        setError("Invalid specification format. Please upload a valid OpenAPI specification in JSON or YAML format.");
        setSpecObj(null);
      }
    } catch (error) {
      setError("Error reading the uploaded file");
      console.error(error);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/json": [".json"],
      "application/yaml": [".yaml", ".yml"],
      "text/yaml": [".yaml", ".yml"],
    },
    maxFiles: 1,
  });

  const generateClient = async () => {
    if (!spec) {
      setError("Please upload an OpenAPI specification first");
      return;
    }

    if (!apiKey) {
      setError("Gemini API key is not configured. Please set NEXT_PUBLIC_GEMINI_API_KEY in environment variables.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const prompt = `Generate a JavaScript client library for the following OpenAPI specification. 
      The client should provide functions for all the endpoints defined in the spec.
      Format the output as JavaScript code only, with detailed comments for each function.
      Here's the OpenAPI specification:
      ${spec}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Extract the generated text from the response
      if (data.candidates && data.candidates[0]?.content?.parts?.length > 0) {
        const generatedText = data.candidates[0].content.parts[0].text;
        // Extract only the code part if there's any explanation
        const codeMatch = generatedText.match(/\`\`\`(?:javascript|js)([\s\S]*?)\`\`\`/);
        setGeneratedClient(codeMatch ? codeMatch[1].trim() : generatedText);
      } else {
        throw new Error("Invalid response format from the API");
      }
    } catch (error) {
      console.error("Error generating client:", error);
      setError(`Failed to generate client: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Generate API Client</h1>
      
      <div className="mb-6">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-blue-400"
          }`}
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <p>Drop the OpenAPI specification file here...</p>
          ) : (
            <p>
              Drag & drop an OpenAPI 3 (Swagger) specification file here, or
              click to select a file
            </p>
          )}
          <p className="text-sm text-gray-500 mt-2">
            Accepts JSON or YAML files
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {!apiKey && (
        <div className="mb-6 p-4 bg-yellow-100 text-yellow-700 rounded-lg">
          Gemini API key not found. Please add NEXT_PUBLIC_GEMINI_API_KEY to your .env.local file.
        </div>
      )}

      {specObj && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Specification Preview</h2>
          <div className="border rounded-lg overflow-hidden">
            <SwaggerUI spec={specObj} />
          </div>
        </div>
      )}

      <div className="mb-6">
        <Button
          onClick={generateClient}
          disabled={!spec || isLoading || !apiKey}
          className="w-full"
        >
          {isLoading ? "Generating..." : "Generate API Client"}
        </Button>
      </div>

      {generatedClient && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Generated Client</h2>
          <div className="border rounded-lg" style={{ height: "500px" }}>
            <MonacoEditor
              height="500px"
              language="javascript"
              value={generatedClient}
              options={{
                readOnly: true,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
} 