"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import yaml from "js-yaml";
import SimpleApiPreview from '@/components/SimpleApiPreview';
import ApiSpecDiff from '@/components/ApiSpecDiff';
import dynamic from "next/dynamic";

// Import Monaco editor dynamically to avoid SSR issues
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false }
);

type Project = {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
};

type Specification = {
  id: string;
  project_id: string;
  file_content: string;
  created_at: string;
};

// Try parsing as YAML safely with fallbacks
const safeParseYaml = (text: string) => {
  console.log("safeParseYaml called with content length:", text.length);
  console.log("Start of content:", text.substring(0, 50).replace(/\n/g, "\\n"));
  
  try {
    // First try with the load function which is more forgiving
    console.log("Trying yaml.load");
    const result = yaml.load(text);
    console.log("yaml.load result type:", typeof result);
    
    if (result && typeof result === 'object') {
      console.log("Valid object returned from yaml.load");
      return result as Record<string, unknown>;
    }
    console.log("yaml.load didn't return an object, got:", typeof result);
  } catch (e) {
    console.error("Initial YAML parse failed:", e);
    // Try with safeLoad which is more strict but may work in some cases
    try {
      console.log("Trying yaml.load with DEFAULT_SCHEMA");
      const result = yaml.load(text, { schema: yaml.DEFAULT_SCHEMA });
      console.log("yaml.load with schema result type:", typeof result);
      
      if (result && typeof result === 'object') {
        console.log("Valid object returned from yaml.load with schema");
        return result as Record<string, unknown>;
      }
      console.log("yaml.load with schema didn't return an object, got:", typeof result);
    } catch (innerE) {
      console.error("Safe YAML parse also failed:", innerE);
      throw e; // Re-throw the original error
    }
  }
  throw new Error("Failed to parse YAML content");
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  
  const [project, setProject] = useState<Project | null>(null);
  const [currentSpec, setCurrentSpec] = useState<Specification | null>(null);
  const [previousSpec, setPreviousSpec] = useState<Specification | null>(null);
  const [specObj, setSpecObj] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  
  // Client generation states
  const [generatingClient, setGeneratingClient] = useState(false);
  const [generatedClient, setGeneratedClient] = useState<string | null>(null);
  const [previousClient, setPreviousClient] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showClientDiff, setShowClientDiff] = useState<boolean>(false);
  
  // Fetch the API key from environment variables
  useEffect(() => {
    // In production, this should be set on the server or in .env.local
    const envApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (envApiKey) {
      setApiKey(envApiKey);
    }
  }, []);
  
  // Add test function
  const testDirectInsert = async () => {
    try {
      setError(null);
      setUploading(true);
      
      // Create a valid minimal OpenAPI spec
      const testSpec = {
        openapi: "3.0.0",
        info: {
          title: "Test API",
          version: "1.0.0"
        },
        paths: {}
      };
      
      const specString = JSON.stringify(testSpec, null, 2);
      console.log("Test spec created:", specString);
      
      if (currentSpec) {
        const { error: updateError } = await supabase
          .from("specifications")
          .update({ file_content: specString })
          .eq("id", currentSpec.id);
          
        if (updateError) {
          console.error("Test update failed:", updateError);
          throw updateError;
        }
        console.log("Test update succeeded");
      } else {
        const { error: insertError } = await supabase
          .from("specifications")
          .insert([{
            project_id: id,
            file_content: specString
          }]);
          
        if (insertError) {
          console.error("Test insert failed:", insertError);
          throw insertError;
        }
        console.log("Test insert succeeded");
      }
      
      // Set the object directly
      setSpecObj(testSpec);
      fetchSpecification();
    } catch (testError: unknown) {
      const errorMessage = testError instanceof Error 
        ? testError.message 
        : "Test insertion failed";
      console.error("Test insertion error:", errorMessage);
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };
  
  useEffect(() => {
    if (isLoaded && user) {
      fetchProject();
      fetchSpecification();
    }
  }, [id, user, isLoaded]);
  
  const fetchProject = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
        
      if (error) throw error;
      
      // Check if project belongs to current user
      if (data.user_id !== user?.id) {
        router.push("/dashboard");
        throw new Error("You don't have access to this project");
      }
      
      setProject(data);
    } catch (error) {
      console.error("Error fetching project:", error);
      setError("Failed to load project");
    }
  };
  
  const fetchSpecification = async () => {
    try {
      console.log("Fetching specifications for project:", id);
      const { data, error } = await supabase
        .from("specifications")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1);
        
      if (error) throw error;
      
      console.log("Specification data received:", data);
      
      if (data && data.length > 0) {
        setCurrentSpec(data[0]);
        try {
          // Try parsing as JSON first
          let parsedSpec: Record<string, unknown>;
          
          console.log("Attempting to parse specification content");
          if (data[0].file_content.trim().startsWith('{')) {
            console.log("Parsing as JSON");
            try {
              parsedSpec = JSON.parse(data[0].file_content);
            } catch (jsonError) {
              console.error("JSON parsing failed:", jsonError);
              // Try parsing as YAML with our safer method
              console.log("Falling back to YAML parsing");
              parsedSpec = safeParseYaml(data[0].file_content);
            }
          } else {
            console.log("Attempting YAML parsing");
            parsedSpec = safeParseYaml(data[0].file_content);
          }
          
          console.log("Successfully parsed specification:", Object.keys(parsedSpec));
          setSpecObj(parsedSpec);
        } catch (parseError) {
          console.error("Failed to parse spec:", parseError);
          setError("Failed to parse the stored specification. It may be in an invalid format.");
        }
      } else {
        console.log("No specifications found for this project");
      }
    } catch (error) {
      console.error("Error fetching specification:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    
    try {
      const file = acceptedFiles[0];
      if (!file) return;
      
      setUploading(true);
      console.log("File being processed:", file.name, "Size:", file.size, "bytes");
      
      const text = await file.text();
      console.log("File content length:", text.length);
      console.log("Start of content:", text.substring(0, 100));
      
      // For direct manual testing - log a simplified version
      try {
        // Try to create a simpler test object to debug
        const testObject = { 
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0.0" },
          paths: {}
        };
        console.log("Test object can be stringified:", JSON.stringify(testObject));
        
        // Try to force parsing using eval (for debugging only)
        // eslint-disable-next-line no-eval
        const evalTest = JSON.stringify(testObject);
        console.log("Eval test successful:", evalTest.substring(0, 50));
      } catch (debugError) {
        console.error("Debug testing failed:", debugError);
      }
      
      // Validate file content
      if (!text || text.trim() === '') {
        throw new Error("Empty file");
      }
      
      // Try parsing to validate format
      try {
        let parsedSpec: Record<string, unknown>;
        
        if (file.name.endsWith('.json')) {
          console.log("Attempting to parse as JSON");
          try {
            parsedSpec = JSON.parse(text);
            console.log("JSON parsing successful");
          } catch (e) {
            console.error("Failed to parse JSON:", e);
            throw new Error("Invalid JSON format");
          }
        } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
          console.log("Attempting to parse as YAML");
          try {
            console.log("Using safeParseYaml function");
            parsedSpec = safeParseYaml(text);
            console.log("YAML parsing successful, result type:", typeof parsedSpec);
            console.log("YAML parsing result keys:", Object.keys(parsedSpec));
          } catch (e) {
            console.error("Failed to parse YAML:", e);
            throw new Error("Invalid YAML format");
          }
        } else {
          console.log("File extension not recognized, trying both JSON and YAML");
          // Try both formats
          try {
            parsedSpec = JSON.parse(text);
            console.log("Parsed as JSON successfully");
          } catch (jsonError) {
            console.log("JSON parsing failed, trying YAML");
            try {
              parsedSpec = safeParseYaml(text);
              console.log("YAML parsing successful");
            } catch (yamlError) {
              console.error("Failed to parse as JSON:", jsonError);
              console.error("Failed to parse as YAML:", yamlError);
              throw new Error("Could not parse as JSON or YAML");
            }
          }
        }
        
        // Validate that it's an OpenAPI spec (more lenient check)
        console.log("Validating OpenAPI spec, keys:", Object.keys(parsedSpec));
        if (!parsedSpec.openapi && !parsedSpec.swagger && 
            !parsedSpec.info && !parsedSpec.paths) {
          console.warn("OpenAPI validation warning: Missing expected fields", parsedSpec);
          // We'll continue anyway since some valid specs might be structured differently
        }
        
        // For debugging, check the structure directly
        console.log("OpenAPI version:", parsedSpec.openapi || parsedSpec.swagger);
        console.log("Has 'info':", !!parsedSpec.info);
        console.log("Has 'paths':", !!parsedSpec.paths);
        
        // Save the previous spec for diff
        if (currentSpec) {
          setPreviousSpec({...currentSpec});
        }
        
        console.log("Saving to database");
        if (currentSpec) {
          // Update existing spec
          const { error } = await supabase
            .from("specifications")
            .update({ file_content: text })
            .eq("id", currentSpec.id);
            
          if (error) {
            console.error("Supabase update error:", error);
            throw error;
          }
          console.log("Updated existing spec");
        } else {
          // Create new spec if none exists
          const { error } = await supabase
            .from("specifications")
            .insert([
              {
                project_id: id,
                file_content: text
              }
            ]);
            
          if (error) {
            console.error("Supabase insert error:", error);
            throw error;
          }
          console.log("Created new spec");
        }
        
        // Update the UI with the parsed spec
        console.log("Setting spec object in state");
        setSpecObj(parsedSpec);
        console.log("Fetching updated specification");
        fetchSpecification(); // Refresh
        
      } catch (parseError: unknown) {
        console.error("Failed to parse file:", parseError);
        const errorMessage = parseError instanceof Error 
          ? parseError.message 
          : "Please upload a valid OpenAPI specification in JSON or YAML format.";
        console.error("Setting error:", errorMessage);
        setError(`Invalid specification format: ${errorMessage}`);
      }
    } catch (error: unknown) {
      console.error("Error uploading specification:", error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : "Failed to upload specification";
      console.error("Setting error:", errorMessage);  
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  }, [id, currentSpec]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/json": [".json"],
      "application/yaml": [".yaml", ".yml"],
      "text/yaml": [".yaml", ".yml"],
    },
    maxFiles: 1,
    disabled: uploading
  });
  
  const toggleDiffView = () => {
    setShowDiff(!showDiff);
  };
  
  // Add a useEffect for logging the spec
  useEffect(() => {
    if (specObj) {
      console.log("Spec object available for rendering:", Object.keys(specObj));
    }
  }, [specObj]);
  
  // Add client generation function
  const generateClient = async () => {
    if (!currentSpec) {
      setError("No API specification available");
      return;
    }

    if (!apiKey) {
      setError("Gemini API key is not configured. Please set NEXT_PUBLIC_GEMINI_API_KEY in environment variables.");
      return;
    }

    setGeneratingClient(true);
    setError(null);

    try {
      // If we have a previous client, save it before generating a new one
      if (generatedClient) {
        setPreviousClient(generatedClient);
      }
      
      let prompt;
      
      if (previousSpec && currentSpec) {
        // If we have a previous spec, use a diff-based prompt
        prompt = `Generate a JavaScript client library for the following OpenAPI specification.
        The client should provide functions for all the endpoints defined in the spec.

        I have a previous version of the API specification and need to update the client code
        based on the changes.
        
        Here's the previous API specification:
        ${previousSpec.file_content}
        
        Here's the new API specification:
        ${currentSpec.file_content}
        
        Please focus on updating only the parts affected by the changes between these spec versions.
        Format the output as JavaScript code only, with detailed comments for each function.`;
      } else {
        // Regular prompt for first-time generation
        prompt = `Generate a JavaScript client library for the following OpenAPI specification. 
        The client should provide functions for all the endpoints defined in the spec.
        Format the output as JavaScript code only, with detailed comments for each function.
        Here's the OpenAPI specification:
        ${currentSpec.file_content}`;
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
        // Automatically show the client when generated
        setShowClientDiff(true);
      } else {
        throw new Error("Invalid response format from the API");
      }
    } catch (error) {
      console.error("Error generating client:", error);
      setError(`Failed to generate client: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setGeneratingClient(false);
    }
  };
  
  if (!isLoaded || loading) {
    return <div>Loading...</div>;
  }
  
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
        <div className="mt-4">
          <Link href="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <Link href="/dashboard" className="text-blue-500 hover:underline mb-2 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold">{project?.name}</h1>
        </div>
        
        {/* Add debug button */}
        <Button onClick={testDirectInsert} variant="outline" className="bg-yellow-100">
          Debug: Insert Test Spec
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-xl font-semibold mb-4">API Specification</h2>
            
            {/* Upload spec */}
            <div className="mb-6">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-blue-400"
                } ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input {...getInputProps()} />
                {uploading ? (
                  <p>Uploading...</p>
                ) : isDragActive ? (
                  <p>Drop the file here...</p>
                ) : (
                  <p className="text-sm">
                    {currentSpec ? "Upload updated spec" : "Upload your API spec"}
                  </p>
                )}
              </div>
            </div>
            
            {previousSpec && (
              <div className="mb-4">
                <Button 
                  onClick={toggleDiffView}
                  variant="outline"
                  className="w-full"
                >
                  {showDiff ? "Hide Spec Changes" : "Show Spec Changes"}
                </Button>
              </div>
            )}
            
            {/* Generate client button */}
            {currentSpec && (
              <div className="mt-4">
                <Button 
                  className="w-full"
                  onClick={generateClient}
                  disabled={generatingClient || !apiKey}
                >
                  {generatingClient 
                    ? "Generating..." 
                    : previousClient && generatedClient
                      ? "Regenerate API Client"
                      : "Generate API Client"
                  }
                </Button>
              </div>
            )}
            
            {/* Show/Hide client toggle */}
            {generatedClient && (
              <div className="mt-4">
                <Button 
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowClientDiff(!showClientDiff)}
                >
                  {showClientDiff ? "Hide Client" : "Show Client"}
                </Button>
              </div>
            )}
          </div>
        </div>
        
        {/* Main content */}
        <div className="lg:col-span-3">
          {!showDiff && !showClientDiff && currentSpec && (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  Current Specification
                  <span className="text-sm text-gray-500 ml-2">
                    Last updated: {new Date(currentSpec.created_at).toLocaleString()}
                  </span>
                </h2>
              </div>
              
              {/* OpenAPI spec preview */}
              {specObj && (
                <div className="bg-white rounded-lg shadow mb-6">
                  <SimpleApiPreview spec={specObj} />
                </div>
              )}
            </>
          )}
          
          {/* Spec Diff view */}
          {showDiff && currentSpec && previousSpec && (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  API Specification Changes
                </h2>
              </div>
              
              <ApiSpecDiff 
                oldSpec={previousSpec.file_content} 
                newSpec={currentSpec.file_content}
                formatType={currentSpec.file_content.trim().startsWith('{') ? 'json' : 'yaml'}
              />
            </>
          )}
          
          {/* Client code */}
          {showClientDiff && generatedClient && (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  API Client Code
                </h2>
              </div>
              
              {previousClient ? (
                <ApiSpecDiff 
                  oldSpec={previousClient} 
                  newSpec={generatedClient}
                  formatType="json" 
                />
              ) : (
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
              )}
            </>
          )}
          
          {/* Empty state */}
          {!currentSpec && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <h3 className="text-lg font-medium mb-2">No specification yet</h3>
              <p className="text-gray-600 mb-4">
                Upload your OpenAPI specification to get started.
              </p>
              <div
                {...getRootProps()}
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors border-gray-300 hover:border-blue-400 max-w-md mx-auto"
              >
                <input {...getInputProps()} />
                <p>
                  Drag & drop an OpenAPI specification file here, or
                  click to select a file
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Accepts JSON or YAML files
                </p>
              </div>
            </div>
          )}
          
          {/* No API key warning */}
          {!apiKey && currentSpec && (
            <div className="mt-4 p-4 bg-yellow-100 text-yellow-700 rounded-lg">
              Gemini API key not found. Please add NEXT_PUBLIC_GEMINI_API_KEY to your .env.local file to enable client generation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 