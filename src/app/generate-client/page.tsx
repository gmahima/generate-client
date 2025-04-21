"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import yaml from "js-yaml";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import SimpleApiPreview from '@/components/SimpleApiPreview';
import ApiSpecDiff from '@/components/ApiSpecDiff';

// Import Monaco editor dynamically to avoid SSR issues
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false }
);

export default function GenerateClientPage() {
  const searchParams = useSearchParams();
  const specId = searchParams.get("specId");
  const { user, isLoaded } = useUser();
  
  const [spec, setSpec] = useState<string | null>(null);
  const [previousSpec, setPreviousSpec] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [specObj, setSpecObj] = useState<Record<string, unknown> | null>(null);
  const [generatedClient, setGeneratedClient] = useState<string | null>(null);
  const [previousClient, setPreviousClient] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSpec, setIsLoadingSpec] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<boolean>(false);

  // Fetch the API key from environment variables
  useEffect(() => {
    // In production, this should be set on the server or in .env.local
    const envApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (envApiKey) {
      setApiKey(envApiKey);
    }
  }, []);

  // Fetch the specification if specId is provided
  useEffect(() => {
    if (specId && isLoaded && user) {
      fetchSpecification(specId);
    }
  }, [specId, isLoaded, user]);

  // Add this useEffect for logging after fetchSpecification
  useEffect(() => {
    if (specObj) {
      console.log("Generate client page - specObj updated:", Object.keys(specObj));
    }
  }, [specObj]);

  const fetchSpecification = async (id: string) => {
    setIsLoadingSpec(true);
    setError(null);
    
    try {
      // Fetch the specification
      const { data: specData, error: specError } = await supabase
        .from("specifications")
        .select("*, projects:project_id(id, name, user_id)")
        .eq("id", id)
        .single();
        
      if (specError) throw specError;
      
      // Check if the user owns this specification
      if (specData.projects.user_id !== user?.id) {
        setError("You don't have access to this specification");
        return;
      }
      
      setProjectId(specData.project_id);
      setSpec(specData.file_content);
      
      try {
        // Try parsing as JSON first
        let parsedSpec: Record<string, unknown>;
        try {
          parsedSpec = JSON.parse(specData.file_content);
        } catch {
          // Try parsing as YAML
          parsedSpec = yaml.load(specData.file_content) as Record<string, unknown>;
        }
        setSpecObj(parsedSpec);
      } catch (parseError) {
        console.error("Failed to parse specification:", parseError);
        setError("Invalid specification format");
      }
    } catch (error) {
      console.error("Error fetching specification:", error);
      setError("Failed to load specification");
    } finally {
      setIsLoadingSpec(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    try {
      const file = acceptedFiles[0];
      if (!file) return;

      const text = await file.text();
      
      // If we already have a spec, save it as previous before updating
      if (spec) {
        setPreviousSpec(spec);
        setHasChanges(true);
        setShowDiff(true);
      }
      
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
  }, [spec]);

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
      // If we have a previous client, save it before generating a new one
      if (generatedClient) {
        setPreviousClient(generatedClient);
      }
      
      let prompt;
      
      if (previousSpec && hasChanges) {
        // If we have a previous spec, use a diff-based prompt
        prompt = `Generate a JavaScript client library for the following OpenAPI specification.
        The client should provide functions for all the endpoints defined in the spec.

        I have a previous version of the API specification and need to update the client code
        based on the changes.
        
        Here's the previous API specification:
        ${previousSpec}
        
        Here's the new API specification:
        ${spec}
        
        Please focus on updating only the parts affected by the changes between these spec versions.
        Format the output as JavaScript code only, with detailed comments for each function.`;
      } else {
        // Regular prompt for first-time generation
        prompt = `Generate a JavaScript client library for the following OpenAPI specification. 
        The client should provide functions for all the endpoints defined in the spec.
        Format the output as JavaScript code only, with detailed comments for each function.
        Here's the OpenAPI specification:
        ${spec}`;
      }

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

  if (isLoadingSpec) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Generate API Client</h1>
        <div className="text-center py-8">Loading specification...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Generate API Client</h1>
      
      {projectId && (
        <div className="mb-4">
          <Link href={`/projects/${projectId}`} className="text-blue-500 hover:underline">
            &larr; Back to Project
          </Link>
        </div>
      )}
      
      {!specId && (
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
      )}

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

      {hasChanges && previousSpec && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-semibold">API Specification Changes</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDiff(!showDiff)}
            >
              {showDiff ? "Hide Changes" : "Show Changes"}
            </Button>
          </div>
          {showDiff && (
            <ApiSpecDiff 
              oldSpec={previousSpec} 
              newSpec={spec} 
              formatType={spec?.trim().startsWith('{') ? 'json' : 'yaml'}
            />
          )}
        </div>
      )}

      {specObj && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Specification Preview</h2>
          <div className="border rounded-lg overflow-hidden">
            <SimpleApiPreview spec={specObj} />
          </div>
        </div>
      )}

      <div className="mb-6">
        <Button
          onClick={generateClient}
          disabled={!spec || isLoading || !apiKey}
          className="w-full"
        >
          {isLoading ? "Generating..." : hasChanges && previousSpec 
            ? "Update API Client" 
            : "Generate API Client"}
        </Button>
      </div>

      {previousClient && generatedClient && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-semibold">Client Code Changes</h2>
          </div>
          <ApiSpecDiff 
            oldSpec={previousClient} 
            newSpec={generatedClient} 
            formatType="json" 
          />
        </div>
      )}

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