"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <nav className="flex space-x-4 mb-8 p-4 border-b">
      <Link 
        href="/" 
        className={`px-3 py-2 rounded-md ${
          isActive("/") 
            ? "bg-blue-100 text-blue-700 font-medium" 
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        }`}
      >
        Home
      </Link>
      <Link 
        href="/generate-client" 
        className={`px-3 py-2 rounded-md ${
          isActive("/generate-client") 
            ? "bg-blue-100 text-blue-700 font-medium" 
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        }`}
      >
        Generate API Client
      </Link>
    </nav>
  );
} 