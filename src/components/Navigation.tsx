"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { UserButton, SignedIn, SignedOut } from "@clerk/nextjs";

export function Navigation() {
  return (
    <nav className="w-full py-4 border-b border-gray-200 bg-white dark:bg-black">
      <div className="container mx-auto flex items-center justify-between">
        <Link href="/" className="font-bold text-xl">
          Generate Client
        </Link>
        
        <div className="flex items-center gap-4">
          <SignedIn>
            <Link href="/dashboard">
              <Button variant="outline">Dashboard</Button>
            </Link>
            <Link href="/projects">
              <Button variant="outline">Projects</Button>
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          
          <SignedOut>
            <Link href="/sign-in">
              <Button variant="outline">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button variant="default">Sign Up</Button>
            </Link>
          </SignedOut>
        </div>
      </div>
    </nav>
  );
} 