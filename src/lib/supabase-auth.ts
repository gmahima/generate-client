import { supabase } from './supabase';
import { currentUser } from '@clerk/nextjs/server';

/**
 * A wrapper for Supabase operations that ensures the user is authenticated
 * and adds the user ID to queries automatically for security
 */
export async function getAuthenticatedSupabase() {
  const user = await currentUser();
  
  if (!user) {
    throw new Error('Authentication required');
  }
  
  // Return an object with helper methods that include the user ID
  return {
    userId: user.id,
    
    // Projects operations
    projects: {
      getAll: async () => {
        return supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
      },
      
      getById: async (id: string) => {
        return supabase
          .from('projects')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();
      },
      
      create: async (name: string) => {
        return supabase
          .from('projects')
          .insert({ name, user_id: user.id })
          .select()
          .single();
      },
      
      update: async (id: string, data: Record<string, unknown>) => {
        return supabase
          .from('projects')
          .update(data)
          .eq('id', id)
          .eq('user_id', user.id);
      },
      
      delete: async (id: string) => {
        return supabase
          .from('projects')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);
      }
    },
    
    // Raw supabase client for advanced queries
    // Always include user_id filter in your queries!
    client: supabase
  };
} 