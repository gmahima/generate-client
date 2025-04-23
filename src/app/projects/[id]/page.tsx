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
import { generatePackageJson } from "@/lib/npm-publish";
import { AlertCircle } from "lucide-react";

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
  
  // Add state for editor mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editorContent, setEditorContent] = useState<string>("");
  
  // Client generation states
  const [generatingClient, setGeneratingClient] = useState(false);
  const [generatedClient, setGeneratedClient] = useState<string | null>(null);
  const [previousClient, setPreviousClient] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showClientDiff, setShowClientDiff] = useState<boolean>(false);
  
  // States for npm publishing
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [packageVersion, setPackageVersion] = useState("1.0.0");
  const [packageDescription, setPackageDescription] = useState("");
  const [packageAuthor, setPackageAuthor] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
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
  
  // Add function to handle spec upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    try {
      const file = acceptedFiles[0];
      if (!file) return;
      
      // Store the current spec as previous
      if (currentSpec) {
        setPreviousSpec(currentSpec);
        setShowDiff(true);
        setHasUnsavedChanges(true);
      }
      
      const fileContent = await file.text();
      
      try {
        // Try parsing the spec based on file type
        let parsedSpec: Record<string, unknown>;
        
        if (file.name.endsWith('.json')) {
          parsedSpec = JSON.parse(fileContent);
        } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
          parsedSpec = safeParseYaml(fileContent);
        } else {
          // Try both formats
          try {
            parsedSpec = JSON.parse(fileContent);
          } catch {
            parsedSpec = safeParseYaml(fileContent);
          }
        }
        
        if (!parsedSpec) {
          throw new Error("Failed to parse file content");
        }
        
        // Set the parsed object first
        setSpecObj(parsedSpec);
        
        // Update or create spec in DB
        setUploading(true);
        
        // Instead of immediately saving to DB, just update the UI with the new spec
        if (currentSpec) {
          // Create a new specification object but don't save to DB yet
          setCurrentSpec({
            ...currentSpec,
            file_content: fileContent
          });
        } else {
          // For new specs, we'll handle create when publishing
          setCurrentSpec({
            id: 'temp-id',
            project_id: id as string,
            file_content: fileContent,
            created_at: new Date().toISOString()
          });
        }
        
        setHasUnsavedChanges(true);
        setSuccessMessage("Specification loaded successfully. It will be saved when you publish to npm.");
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (parseError) {
        console.error("Failed to parse file:", parseError);
        setError("Invalid API specification format. Please upload a valid OpenAPI spec in JSON or YAML format.");
      }
    } catch (error) {
      console.error("Error reading file:", error);
      setError("Failed to read the uploaded file");
    } finally {
      setUploading(false);
    }
  }, [currentSpec, id]);
  
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
  
  // Add save spec function
  const saveSpecToDb = async () => {
    if (!currentSpec) return false;
    
    try {
      if (currentSpec.id === 'temp-id') {
        // This is a new spec, need to insert
        const { data, error } = await supabase
          .from("specifications")
          .insert({
            project_id: id,
            file_content: currentSpec.file_content
          })
          .select()
          .single();
          
        if (error) throw error;
        
        // Update with the real ID
        setCurrentSpec(data);
      } else {
        // Update existing spec
        const { error } = await supabase
          .from("specifications")
          .update({ file_content: currentSpec.file_content })
          .eq("id", currentSpec.id);
          
        if (error) throw error;
      }
      
      setHasUnsavedChanges(false);
      return true;
    } catch (error) {
      console.error("Error saving specification:", error);
      setError("Failed to save specification to database");
      return false;
    }
  };
  
  // Add function to publish to npm
  const handlePublishToNpm = async () => {
    if (!generatedClient || !currentSpec) return;
    
    setIsPublishing(true);
    setPublishResult(null);
    
    try {
      // First save spec to DB if needed
      if (hasUnsavedChanges) {
        const specSaved = await saveSpecToDb();
        if (!specSaved) {
          throw new Error("Failed to save specification to database. Aborting package publishing.");
        }
      }
      
      // Generate package.json content
      const packageJson = generatePackageJson({
        name: packageName,
        version: packageVersion,
        description: packageDescription,
        author: packageAuthor,
      });

      // Create FormData for API request
      const formData = new FormData();
      
      // Add the package.json file
      const packageJsonBlob = new Blob([packageJson], { type: 'application/json' });
      formData.append('package.json', packageJsonBlob, 'package.json');
      
      // Add the index.js file containing the client code
      const clientCodeBlob = new Blob([generatedClient], { type: 'application/javascript' });
      formData.append('index.js', clientCodeBlob, 'index.js');
      
      // Send the request to the API endpoint
      const response = await fetch('/api/publish-npm', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to publish package');
      }

      const data = await response.json();
      setPublishResult({
        success: true,
        message: data.message || 'Package published successfully',
      });
    } catch (error) {
      setPublishResult({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsPublishing(false);
    }
  };
  
  // Basic validation for npm package
  const isPackageValid = packageName.trim() !== "" && 
                         packageVersion.trim() !== "" && 
                         /^\d+\.\d+\.\d+$/.test(packageVersion.trim());
  
  // Add function to toggle edit mode
  const toggleEditMode = () => {
    if (currentSpec) {
      if (!isEditMode) {
        // When entering edit mode, initialize editor with current spec content
        setEditorContent(currentSpec.file_content);
      } else if (editorContent !== currentSpec.file_content) {
        // When exiting edit mode with changes, update the spec
        try {
          // Parse the edited content to validate it
          let parsedSpec: Record<string, unknown>;
          
          if (editorContent.trim().startsWith('{')) {
            parsedSpec = JSON.parse(editorContent);
          } else {
            parsedSpec = safeParseYaml(editorContent);
          }
          
          // Update the current spec with edited content
          setCurrentSpec({
            ...currentSpec,
            file_content: editorContent
          });
          
          // Update the parsed object
          setSpecObj(parsedSpec);
          
          // Mark as having unsaved changes
          setHasUnsavedChanges(true);
        } catch (parseError) {
          console.error("Failed to parse edited content:", parseError);
          setError("Invalid API specification format. Please correct the format before saving.");
          // Stay in edit mode if there's an error
          return;
        }
      }
    }
    
    setIsEditMode(!isEditMode);
  };
  
  // Add handler for editor content changes
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setEditorContent(value);
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
      
      {/* Add success message */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-100 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}
      
      {hasUnsavedChanges && (
        <div className="mb-6 p-4 bg-yellow-100 text-yellow-700 rounded-lg flex justify-between items-center">
          <div>
            <p className="font-medium">You have unsaved changes to the specification</p>
            <p className="text-sm mt-1">
              The specification will be saved to the database when you publish the package, keeping it in sync with your npm package.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={saveSpecToDb}
            disabled={uploading}
          >
            Save to DB
          </Button>
        </div>
      )}
      
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
            
            {/* Add edit mode toggle button for when there's only one spec */}
            {currentSpec && !previousSpec && !showClientDiff && (
              <div className="mb-4">
                <Button 
                  onClick={toggleEditMode}
                  variant="outline"
                  className="w-full"
                >
                  {isEditMode ? "Save & Exit Editor" : "Edit API Spec"}
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
            
            {/* Add publish to npm button */}
            {generatedClient && (
              <div className="mt-4">
                <Button 
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsPublishDialogOpen(true)}
                  disabled={!generatedClient}
                >
                  {hasUnsavedChanges ? "Save & Publish to npm" : "Publish to npm"}
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
              
              {/* Show editor when in edit mode, otherwise show the preview */}
              {isEditMode ? (
                <div className="border rounded-lg" style={{ height: "500px" }}>
                  <MonacoEditor
                    height="500px"
                    language={editorContent.trim().startsWith('{') ? "json" : "yaml"}
                    value={editorContent}
                    onChange={handleEditorChange}
                    options={{
                      minimap: { enabled: true },
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>
              ) : (
                /* OpenAPI spec preview */
                specObj && (
                  <div className="bg-white rounded-lg shadow mb-6">
                    <SimpleApiPreview spec={specObj} />
                  </div>
                )
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
      
      {/* Publish to npm dialog */}
      {isPublishDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Publish to npm</h2>
            
            {hasUnsavedChanges && (
              <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
                <p className="font-medium">Important:</p>
                <p>Your specification changes will be saved to the database when you publish, ensuring the database and npm package stay in sync.</p>
              </div>
            )}
            
            <p className="text-gray-600 mb-4">
              Fill out the package details below to publish your client to npm
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="packageName" className="text-sm font-medium text-right">
                  Package Name
                </label>
                <input
                  id="packageName"
                  value={packageName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPackageName(e.target.value)}
                  className="col-span-3 px-3 py-2 border rounded-md w-full"
                  placeholder="my-api-client"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="version" className="text-sm font-medium text-right">
                  Version
                </label>
                <input
                  id="version"
                  value={packageVersion}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPackageVersion(e.target.value)}
                  className="col-span-3 px-3 py-2 border rounded-md w-full"
                  placeholder="1.0.0"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="description" className="text-sm font-medium text-right">
                  Description
                </label>
                <textarea
                  id="description"
                  value={packageDescription}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPackageDescription(e.target.value)}
                  className="col-span-3 px-3 py-2 border rounded-md w-full"
                  placeholder="Generated API client for my API"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="author" className="text-sm font-medium text-right">
                  Author
                </label>
                <input
                  id="author"
                  value={packageAuthor}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPackageAuthor(e.target.value)}
                  className="col-span-3 px-3 py-2 border rounded-md w-full"
                  placeholder="Your Name"
                />
              </div>
            </div>

            {publishResult && (
              <div className={`p-4 mt-4 rounded-lg ${publishResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <p className="font-medium">
                    {publishResult.success ? "Success" : "Error"}
                  </p>
                </div>
                <p className="ml-6">
                  {publishResult.message}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <Button 
                variant="outline" 
                onClick={() => setIsPublishDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handlePublishToNpm}
                disabled={!isPackageValid || isPublishing}
              >
                {isPublishing ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 