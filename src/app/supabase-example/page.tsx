'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface TableRow {
  [key: string]: string | number | boolean | object | null
}

export default function SupabaseExample() {
  const [data, setData] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Example of fetching data from Supabase
    async function fetchData() {
      try {
        setLoading(true)
        
        // Replace 'your_table' with your actual table name
        const { data, error } = await supabase
          .from('your_table')
          .select('*')
          .limit(10)
        
        if (error) {
          throw error
        }
        
        setData(data || [])
        setMessage('Connected to Supabase successfully!')
      } catch (error: unknown) {
        console.error('Error fetching data:', error)
        setMessage('Error connecting to Supabase. Check your console for details.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Supabase Example</h1>
      
      <div className="p-4 border rounded-lg mb-6 bg-white dark:bg-slate-800">
        <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
        {loading ? (
          <p>Connecting to Supabase...</p>
        ) : (
          <p className={message.includes('Error') ? 'text-red-500' : 'text-green-500'}>
            {message}
          </p>
        )}
      </div>

      <div className="p-4 border rounded-lg mb-6 bg-white dark:bg-slate-800">
        <h2 className="text-xl font-semibold mb-2">Data from Supabase</h2>
        {loading ? (
          <p>Loading data...</p>
        ) : data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-slate-700">
                  {Object.keys(data[0]).map((key) => (
                    <th key={key} className="p-2 text-left border">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-b">
                    {Object.values(row).map((value, j) => (
                      <td key={j} className="p-2 border">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No data found or table may not exist yet.</p>
        )}
      </div>

      <div className="flex gap-4">
        <Link href="/">
          <Button variant="outline">Back to Home</Button>
        </Link>
      </div>

      <div className="mt-8 p-4 border rounded-lg bg-white dark:bg-slate-800">
        <h2 className="text-xl font-semibold mb-2">Next Steps</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Create tables in your Supabase dashboard</li>
          <li>Replace &apos;your_table&apos; with your actual table name</li>
          <li>Add authentication using Supabase Auth</li>
          <li>Build more complex queries with the Supabase client</li>
        </ol>
      </div>
    </div>
  )
} 