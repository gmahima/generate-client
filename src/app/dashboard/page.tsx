import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getAuthenticatedSupabase } from "@/lib/supabase-auth";
import { currentUser } from "@clerk/nextjs/server";
import { UserNav } from "@/components/UserNav";

type Project = {
  id: string;
  name: string;
  created_at: string;
};

export default async function DashboardPage() {
  // Get the user for display purposes
  const user = await currentUser();
  
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="p-8 rounded-lg shadow-md bg-white">
          <h2 className="text-2xl font-semibold mb-4">Authentication Required</h2>
          <p className="mb-4">You need to sign in to access the dashboard.</p>
          <Link href="/sign-in">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Get authenticated Supabase client
  const supabaseAuth = await getAuthenticatedSupabase();
  
  // Fetch projects
  const { data, error } = await supabaseAuth.projects.getAll();
  const projects: Project[] = data || [];
  
  if (error) {
    console.error("Error fetching projects:", error);
  }
  
  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <UserNav />
      </div>
      
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Welcome, {user.firstName || user.emailAddresses[0]?.emailAddress}</h2>
        <p>Manage your API specs and generated clients here.</p>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">Your Projects</h2>
        <Link href="/projects/new">
          <Button>Create New Project</Button>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {projects.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {project.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(project.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <Link href={`/projects/${project.id}`}>
                      <Button variant="outline" size="sm" className="mr-2">
                        View
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center">
            <p className="text-gray-500 mb-4">No projects found. Create your first project to get started!</p>
            <Link href="/projects/new">
              <Button>Create New Project</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
} 