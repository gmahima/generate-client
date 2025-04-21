"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function NewProjectPage() {
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user, isLoaded } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectName.trim()) {
      setError("Project name is required");
      return;
    }
    
    if (!isLoaded || !user) {
      setError("You must be logged in to create a project");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Insert the new project into Supabase
      const { data, error } = await supabase
        .from("projects")
        .insert([
          { 
            name: projectName.trim(),
            user_id: user.id 
          }
        ])
        .select()
        .single();
      
      if (error) throw error;
      
      // Navigate to the project page
      router.push(`/projects/${data.id}`);
    } catch (err) {
      console.error("Error creating project:", err);
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };
  
  if (!isLoaded) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="container mx-auto p-6 max-w-lg">
      <h1 className="text-3xl font-bold mb-6">Create New Project</h1>
      
      {error && (
        <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" htmlFor="project-name">
              Project Name
            </label>
            <input
              id="project-name"
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My API Project"
              required
            />
          </div>
          
          <div className="flex justify-end space-x-4 mt-6">
            <Link href="/dashboard">
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
} 