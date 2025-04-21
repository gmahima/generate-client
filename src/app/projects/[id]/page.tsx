"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useDropzone } from "react-dropzone";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import Link from "next/link";
import yaml from "js-yaml";
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

type SpecVersion = {
  id: string;
  project_id: string;
  version: number;
  file_content: string;
  created_at: string;
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  
  const [project, setProject] = useState<Project | null>(null);
  const [specVersions, setSpecVersions] = useState<SpecVersion[]>([]);
  const [currentSpec, setCurrentSpec] = useState<SpecVersion | null>(null);
  const [compareSpec, setCompareSpec] = useState<SpecVersion | null>(null);
  const [specObj, setSpecObj] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  
  useEffect(() => {
    if (isLoaded && user) {
      fetchProject();
      fetchSpecVersions();
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
  
  const fetchSpecVersions = async () => {
    try {
      const { data, error } = await supabase
        .from("specifications")
        .select("*")
        .eq("project_id", id)
        .order("version", { ascending: false });
        
      if (error) throw error;
      
      setSpecVersions(data || []);
      
      // Set the latest version as current
      if (data && data.length > 0) {
        setCurrentSpec(data[0]);
        try {
          // Try parsing as JSON first
          let parsedSpec: Record<string, unknown>;
          try {
            parsedSpec = JSON.parse(data[0].file_content);
          } catch {
            // Try parsing as YAML
            parsedSpec = yaml.load(data[0].file_content) as Record<string, unknown>;
          }
          setSpecObj(parsedSpec);
        } catch (parseError) {
          console.error("Failed to parse spec:", parseError);
        }
      }
    } catch (error) {
      console.error("Error fetching specifications:", error);
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
      
      const text = await file.text();
      
      // Try parsing to validate format
      try {
        let parsedSpec: Record<string, unknown>;
        if (file.name.endsWith('.json')) {
          parsedSpec = JSON.parse(text);
        } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
          parsedSpec = yaml.load(text) as Record<string, unknown>;
        } else {
          // Try both formats
          try {
            parsedSpec = JSON.parse(text);
          } catch {
            parsedSpec = yaml.load(text) as Record<string, unknown>;
          }
        }
        
        // Calculate next version number
        const nextVersion = specVersions.length > 0 
          ? specVersions[0].version + 1 
          : 1;
        
        // Insert the new specification version
        const { error } = await supabase
          .from("specifications")
          .insert([
            {
              project_id: id,
              version: nextVersion,
              file_content: text
            }
          ]);
          
        if (error) throw error;
        
        // Update the UI
        setSpecObj(parsedSpec);
        fetchSpecVersions(); // Refresh the list
        
      } catch (parseError) {
        console.error("Failed to parse file:", parseError);
        setError("Invalid specification format. Please upload a valid OpenAPI specification in JSON or YAML format.");
      }
    } catch (error) {
      console.error("Error uploading specification:", error);
      setError("Failed to upload specification");
    } finally {
      setUploading(false);
    }
  }, [id, specVersions]);
  
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
  
  const selectVersionForComparison = (version: SpecVersion) => {
    setCompareSpec(version);
    setShowDiff(true);
  };
  
  const selectVersion = (version: SpecVersion) => {
    setCurrentSpec(version);
    try {
      // Try parsing as JSON first
      let parsedSpec: Record<string, unknown>;
      try {
        parsedSpec = JSON.parse(version.file_content);
      } catch {
        // Try parsing as YAML
        parsedSpec = yaml.load(version.file_content) as Record<string, unknown>;
      }
      setSpecObj(parsedSpec);
      setShowDiff(false);
      setCompareSpec(null);
    } catch (parseError) {
      console.error("Failed to parse spec:", parseError);
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
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar with versions */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-xl font-semibold mb-4">Spec Versions</h2>
            
            {/* Upload new version */}
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
                    Upload a new version
                  </p>
                )}
              </div>
            </div>
            
            {/* Version list */}
            {specVersions.length === 0 ? (
              <p className="text-gray-500 text-center">No versions yet</p>
            ) : (
              <ul className="space-y-2">
                {specVersions.map((version) => (
                  <li key={version.id}>
                    <div className="flex justify-between items-center p-2 border rounded hover:bg-gray-50">
                      <button 
                        onClick={() => selectVersion(version)}
                        className={`text-left flex-grow ${currentSpec?.id === version.id ? 'font-semibold' : ''}`}
                      >
                        v{version.version}
                        <span className="block text-xs text-gray-500">
                          {new Date(version.created_at).toLocaleString()}
                        </span>
                      </button>
                      {specVersions.length > 1 && currentSpec?.id !== version.id && (
                        <button 
                          onClick={() => selectVersionForComparison(version)}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Compare
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        
        {/* Main content */}
        <div className="lg:col-span-3">
          {!showDiff && currentSpec && (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  Version {currentSpec.version} 
                  <span className="text-sm text-gray-500 ml-2">
                    Uploaded: {new Date(currentSpec.created_at).toLocaleString()}
                  </span>
                </h2>
              </div>
              
              {/* Swagger UI for current spec */}
              {specObj && (
                <div className="bg-white rounded-lg shadow mb-6">
                  <SwaggerUI spec={specObj} />
                </div>
              )}
            </>
          )}
          
          {/* Diff view */}
          {showDiff && currentSpec && compareSpec && (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  Comparing v{currentSpec.version} with v{compareSpec.version}
                </h2>
                <Button 
                  onClick={() => setShowDiff(false)} 
                  variant="outline" 
                  className="mt-2"
                >
                  Back to Current Version
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Version {compareSpec.version}</h3>
                  <div className="border rounded h-[400px] overflow-hidden">
                    <MonacoEditor
                      height="400px"
                      language={compareSpec.file_content.trim().startsWith('{') ? "json" : "yaml"}
                      value={compareSpec.file_content}
                      options={{ readOnly: true, minimap: { enabled: false } }}
                    />
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Version {currentSpec.version} (Latest)</h3>
                  <div className="border rounded h-[400px] overflow-hidden">
                    <MonacoEditor
                      height="400px"
                      language={currentSpec.file_content.trim().startsWith('{') ? "json" : "yaml"}
                      value={currentSpec.file_content}
                      options={{ readOnly: true, minimap: { enabled: false } }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          
          {/* Empty state */}
          {specVersions.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <h3 className="text-lg font-medium mb-2">No specifications yet</h3>
              <p className="text-gray-600 mb-4">
                Upload your first OpenAPI specification to get started.
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
          
          {/* Generate client button */}
          {currentSpec && (
            <div className="mt-6">
              <Link href={`/generate-client?specId=${currentSpec.id}`}>
                <Button className="w-full">
                  Generate API Client for this Version
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 