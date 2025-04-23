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
  npm_configs?: NpmConfig;
};

type NpmConfig = {
  package_name: string;
  version: string;
  description: string;
  author: string;
};

type Specification = {
  id: string;
  project_id: string;
  file_content: string;
  created_at: string;
  version?: string;
};

type SpecVersion = {
  id: string;
  spec_id: string;
  version: string;
  file_content: string;
  created_at: string;
  is_published: boolean;
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
  
  // States for client view
  const [generatedClient, setGeneratedClient] = useState<string | null>(null);
  const [previousClient, setPreviousClient] = useState<string | null>(null);
  const [showClientDiff, setShowClientDiff] = useState<boolean>(false);
  
  // States for npm configuration
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [npmConfig, setNpmConfig] = useState<NpmConfig>({
    package_name: "",
    version: "1.0.0",
    description: "",
    author: ""
  });
  
  // State for version control
  const [versions, setVersions] = useState<SpecVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  
  // States for confirmation dialog
  const [isConfirmUploadOpen, setIsConfirmUploadOpen] = useState(false);
  const [pendingUploadContent, setPendingUploadContent] = useState<string | null>(null);
  
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  useEffect(() => {
    if (isLoaded && user) {
      fetchProject();
    }
  }, [id, user, isLoaded]);

  useEffect(() => {
    if (project) {
      // Check if npm config exists
      if (!project.npm_configs) {
        setIsConfigDialogOpen(true);
      }
      fetchSpecification();
      fetchSpecVersions();
    }
  }, [project]);
  
  const fetchProject = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*, npm_configs(*)")
        .eq("id", id)
        .single();
        
      if (error) throw error;
      
      // Check if project belongs to current user
      if (data.user_id !== user?.id) {
        router.push("/dashboard");
        throw new Error("You don't have access to this project");
      }
      
      // Transform npm_config if it exists
      if (data.npm_configs) {
        setNpmConfig({
          package_name: data.npm_configs.package_name || "",
          version: data.npm_configs.version || "1.0.0",
          description: data.npm_configs.description || "",
          author: data.npm_configs.author || ""
        });
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
  
  const fetchSpecVersions = async () => {
    try {
      const { data, error } = await supabase
        .from("spec_versions")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setVersions(data);
        // Set the latest version as selected by default
        setSelectedVersion(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching spec versions:", error);
    }
  };
  
  // Save npm config to database
  const saveNpmConfig = async () => {
    try {
      // Check if we already have a config
      if (project?.npm_configs) {
        // Update existing config
        const { error } = await supabase
          .from("npm_configs")
          .update({
            package_name: npmConfig.package_name,
            version: npmConfig.version,
            description: npmConfig.description,
            author: npmConfig.author
          })
          .eq("project_id", id);
          
        if (error) throw error;
      } else {
        // Create new config
        const { error } = await supabase
          .from("npm_configs")
          .insert({
            project_id: id,
            package_name: npmConfig.package_name,
            version: npmConfig.version,
            description: npmConfig.description,
            author: npmConfig.author
          });
          
        if (error) throw error;
      }
      
      // Update the project object
      setProject(prev => {
        if (!prev) return null;
        return {
          ...prev,
          npm_configs: npmConfig
        };
      });
      
      setIsConfigDialogOpen(false);
      setSuccessMessage("NPM configuration saved successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Error saving npm config:", error);
      setError("Failed to save npm configuration");
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
        
        // Set the parsed object
        setSpecObj(parsedSpec);
        
        // Set the pending upload content
        setPendingUploadContent(fileContent);
        
        // Show confirmation dialog
        setIsConfirmUploadOpen(true);
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
  }, [currentSpec]);
  
  // Function to confirm and upload a new version
  const confirmUpload = async () => {
    if (!pendingUploadContent) return;
    
    setUploading(true);
    setError(null);
    
    try {
      // First, check if we have a main specification
      if (!currentSpec) {
        // Create the main specification first
        const { data: specData, error: specError } = await supabase
          .from("specifications")
          .insert({
            project_id: id,
            file_content: pendingUploadContent
          })
          .select()
          .single();
          
        if (specError) throw specError;
        
        setCurrentSpec(specData);
        
        // Now create the first version
        const { error: versionError } = await supabase
          .from("spec_versions")
          .insert({
            project_id: id,
            spec_id: specData.id,
            version: "1.0.0",
            file_content: pendingUploadContent,
            is_published: false
          });
          
        if (versionError) throw versionError;
      } else {
        // Create a new version of the existing spec
        // Calculate new version number
        const newVersion = calculateNewVersion(versions);
        
        const { error: versionError } = await supabase
          .from("spec_versions")
          .insert({
            project_id: id,
            spec_id: currentSpec.id,
            version: newVersion,
            file_content: pendingUploadContent,
            is_published: false
          });
          
        if (versionError) throw versionError;
        
        // Update the main specification
        const { error: updateError } = await supabase
          .from("specifications")
          .update({ 
            file_content: pendingUploadContent,
            version: newVersion
          })
          .eq("id", currentSpec.id);
          
        if (updateError) throw updateError;
        
        // Update the current spec in state
        setCurrentSpec({
          ...currentSpec,
          file_content: pendingUploadContent,
          version: newVersion
        });
      }
      
      // Reset states
      setPendingUploadContent(null);
      setIsConfirmUploadOpen(false);
      
      // Refresh versions
      fetchSpecVersions();
      
      // Show success message
      setSuccessMessage("Specification uploaded successfully. The client will be generated on the server.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Error uploading specification:", error);
      setError(`Failed to upload specification: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUploading(false);
    }
  };
  
  // Calculate the next version based on existing versions
  const calculateNewVersion = (versions: SpecVersion[]): string => {
    if (versions.length === 0) return "1.0.0";
    
    // Get the latest version
    const latestVersion = versions[0].version;
    
    // Split into major.minor.patch
    const parts = latestVersion.split('.').map(Number);
    
    // Increment patch version
    parts[2] += 1;
    
    return parts.join('.');
  };
  
  const toggleDiffView = () => {
    setShowDiff(!showDiff);
  };
  
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
          
          // Set the pending upload
          setPendingUploadContent(editorContent);
          
          // Show confirmation dialog
          setIsConfirmUploadOpen(true);
          
          // Update the parsed object
          setSpecObj(parsedSpec);
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
  
  // Function to view a specific version
  const viewVersion = async (versionId: string) => {
    // Find the version in our list
    const version = versions.find(v => v.id === versionId);
    if (!version) return;
    
    try {
      // Parse the version content
      let parsedSpec: Record<string, unknown>;
      
      if (version.file_content.trim().startsWith('{')) {
        parsedSpec = JSON.parse(version.file_content);
      } else {
        parsedSpec = safeParseYaml(version.file_content);
      }
      
      // Update states
      setSpecObj(parsedSpec);
      setSelectedVersion(versionId);
      setShowDiff(false);
      
      // If we have the current version and a previous one, show diff
      if (versionId !== versions[0].id) {
        // Current spec is latest
        const latestVersion = versions[0];
        setPreviousSpec({
          id: version.id,
          project_id: id as string,
          file_content: version.file_content,
          created_at: version.created_at,
          version: version.version
        });
        
        setCurrentSpec({
          id: latestVersion.spec_id,
          project_id: id as string,
          file_content: latestVersion.file_content,
          created_at: latestVersion.created_at,
          version: latestVersion.version
        });
        
        setShowDiff(true);
      }
    } catch (error) {
      console.error("Error parsing version content:", error);
      setError("Failed to parse the version content");
    }
  };
  
  // Add handler for editor content changes
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setEditorContent(value);
    }
  };
  
  // Handle npm config input changes
  const handleNpmConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setNpmConfig({
      ...npmConfig,
      [id]: value
    });
  };
  
  // Fetch the latest client code
  const fetchLatestClient = async () => {
    try {
      const { data, error } = await supabase
        .from("generated_clients")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setGeneratedClient(data[0].client_code);
        
        // If we have more than one, get the previous one too
        if (data.length > 1) {
          setPreviousClient(data[1].client_code);
        }
        
        setShowClientDiff(true);
      } else {
        setError("No generated client found for this project. Please upload a specification first.");
      }
    } catch (error) {
      console.error("Error fetching generated client:", error);
      setError("Failed to fetch generated client");
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
        
        {/* NPM config button */}
        <Button onClick={() => setIsConfigDialogOpen(true)} variant="outline">
          NPM Configuration
        </Button>
      </div>
      
      {/* Add success message */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-100 text-green-700 rounded-lg">
          {successMessage}
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
                    {currentSpec ? "Upload new version" : "Upload your API spec"}
                  </p>
                )}
              </div>
            </div>
            
            {/* Versions list */}
            {versions.length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">Specification Versions</h3>
                <div className="max-h-48 overflow-y-auto">
                  {versions.map((version) => (
                    <div 
                      key={version.id}
                      className={`p-2 mb-1 rounded cursor-pointer ${
                        selectedVersion === version.id 
                          ? "bg-blue-100" 
                          : "hover:bg-gray-100"
                      }`}
                      onClick={() => viewVersion(version.id)}
                    >
                      <div className="flex justify-between items-center">
                        <span>v{version.version}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(version.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {version.is_published && (
                        <span className="text-xs text-green-600">Published</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {showDiff && (
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
            
            {/* View latest client button */}
            {currentSpec && (
              <div className="mt-4">
                <Button 
                  className="w-full"
                  onClick={fetchLatestClient}
                >
                  View Latest Generated Client
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
                  {currentSpec.version && (
                    <span className="ml-2 text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      v{currentSpec.version}
                    </span>
                  )}
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
                  <span className="text-sm text-gray-500 ml-2">
                    From v{previousSpec.version} to v{currentSpec.version}
                  </span>
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
          {!currentSpec && !versions.length && (
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
        </div>
      </div>
      
      {/* NPM Configuration Dialog */}
      {isConfigDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">NPM Package Configuration</h2>
            
            <p className="text-gray-600 mb-4">
              Configure the NPM package details for your API client
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="package_name" className="text-sm font-medium text-right">
                  Package Name
                </label>
                <input
                  id="package_name"
                  value={npmConfig.package_name}
                  onChange={handleNpmConfigChange}
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
                  value={npmConfig.version}
                  onChange={handleNpmConfigChange}
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
                  value={npmConfig.description}
                  onChange={handleNpmConfigChange}
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
                  value={npmConfig.author}
                  onChange={handleNpmConfigChange}
                  className="col-span-3 px-3 py-2 border rounded-md w-full"
                  placeholder="Your Name"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button 
                variant="outline" 
                onClick={() => setIsConfigDialogOpen(false)}
                disabled={!project?.npm_configs}
              >
                Cancel
              </Button>
              <Button 
                onClick={saveNpmConfig}
                disabled={!npmConfig.package_name || !npmConfig.version}
              >
                Save Configuration
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Upload Confirmation Dialog */}
      {isConfirmUploadOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Confirm Upload</h2>
            
            <p className="text-gray-600 mb-4">
              Are you sure you want to upload this new specification version?
            </p>
            
            <p className="text-gray-700 mb-4">
              Once confirmed, the following will happen:
            </p>
            
            <ul className="list-disc pl-6 mb-6 text-sm text-gray-600 space-y-1">
              <li>A new version will be saved to the database</li>
              <li>The client code will be generated on the server using AI</li>
              <li>The npm package will be published automatically with the new version</li>
            </ul>

            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setPendingUploadContent(null);
                  setIsConfirmUploadOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmUpload}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Confirm Upload"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 