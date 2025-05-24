import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  FileCog,
  AlertTriangle,
  Search,
  Trash2,
  ListChecks,
  BarChart3,
  Save,
  Database,
  Upload,
  RefreshCw,
} from "lucide-react";

import { toast } from "sonner";
import { useBTreeStore } from "../stores/bTreeStore";

export default function BTreeShowcase() {
  const {
    loading,
    initialized,
    entries,
    stats,
    error,
    searchResult,
    rangeResults,
    bulkLoadProgress,
    initialize,
    insert,
    search,
    delete: deleteKey,
    range,
    clear,
    bulkLoad,
    verify,
    refreshData,
    setSearchResult,
    setRangeResults,
    setError,
  } = useBTreeStore();

  // Form states
  const [insertKey, setInsertKey] = useState("");
  const [insertValue, setInsertValue] = useState("");
  const [searchKey, setSearchKey] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  // Initialize B-tree on mount
  useEffect(() => {
    initialize().catch((err) => {
      console.error("Failed to initialize B-tree:", err);
    });

    // Cleanup on unmount or window unload
    const handleUnload = () => {
      if (useBTreeStore.getState().btree) {
        useBTreeStore.getState().cleanup();
      }
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [initialize]);

  // Show toast for errors
  useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null);
    }
  }, [error, setError]);

  // Insert operation
  const handleInsert = async () => {
    if (!insertKey || !insertValue) {
      toast.error("Please enter both key and value");
      return;
    }

    const key = parseInt(insertKey);
    if (isNaN(key)) {
      toast.error("Key must be a number");
      return;
    }

    try {
      await insert(key, insertValue);
      toast.success(`Inserted: ${key} → ${insertValue}`);
      setInsertKey("");
      setInsertValue("");
    } catch (err) {
      // Error is handled by store
    }
  };

  // Search operation
  const handleSearch = async () => {
    if (!searchKey) {
      toast.error("Please enter a key to search");
      return;
    }

    const key = parseInt(searchKey);
    if (isNaN(key)) {
      toast.error("Key must be a number");
      return;
    }

    try {
      await search(key);
      if (searchResult !== null) {
        toast.success(`Found: ${key} → ${searchResult}`);
      } else {
        toast.info(`Key ${key} not found`);
      }
    } catch (err) {
      // Error is handled by store
    }
  };

  // Delete operation
  const handleDelete = async (key: number) => {
    try {
      await deleteKey(key);
      toast.success(`Deleted key: ${key}`);
    } catch (err) {
      // Error is handled by store
    }
  };

  // Range query
  const handleRangeQuery = async () => {
    if (!rangeStart || !rangeEnd) {
      toast.error("Please enter both start and end keys");
      return;
    }

    const start = parseInt(rangeStart);
    const end = parseInt(rangeEnd);
    if (isNaN(start) || isNaN(end)) {
      toast.error("Range keys must be numbers");
      return;
    }

    try {
      await range(start, end);
      toast.success(
        `Found ${rangeResults.length} entries in range [${start}, ${end}]`
      );
    } catch (err) {
      // Error is handled by store
    }
  };

  // Clear all data
  const handleClear = async () => {
    if (!confirm("Are you sure you want to clear all data?")) return;

    try {
      await clear();
      toast.success("All data cleared");
    } catch (err) {
      // Error is handled by store
    }
  };

  // Bulk load demo data
  const handleBulkLoad = async () => {
    try {
      await bulkLoad();
      toast.success("Bulk loaded 100 entries");
    } catch (err) {
      // Error is handled by store
    }
  };

  // Verify tree integrity
  const handleVerify = async () => {
    try {
      await verify();
      toast.success("Tree integrity verified ✓");
    } catch (err) {
      // Error is handled by store
    }
  };

  if (!initialized && loading) {
    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mr-2" />
          <span>Initializing B-Tree...</span>
        </CardContent>
      </Card>
    );
  }

  if (!initialized) {
    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardContent className="py-12">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to initialize B-Tree. Please check browser console for
              details.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-6xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-6 h-6" />
              OPFS B-Tree Showcase
            </CardTitle>
            <CardDescription>
              High-performance persistent B-tree implementation using browser
              file system
            </CardDescription>
          </div>
          {stats && (
            <div className="flex gap-4 text-sm">
              <div className="text-center">
                <div className="font-semibold">{stats.nodeCount}</div>
                <div className="text-muted-foreground">Nodes</div>
              </div>
              <div className="text-center">
                <div className="font-semibold">{stats.height}</div>
                <div className="text-muted-foreground">Height</div>
              </div>
              <div className="text-center">
                <div className="font-semibold">
                  {(stats.cacheHitRate * 100).toFixed(1)}%
                </div>
                <div className="text-muted-foreground">Cache Hit</div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="operations" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="data">Data View</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Actions</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="operations" className="space-y-4">
            {/* Insert Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Insert
                </CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Input
                  placeholder="Key (number)"
                  value={insertKey}
                  onChange={(e) => setInsertKey(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleInsert()}
                  disabled={loading}
                />
                <Input
                  placeholder="Value (string)"
                  value={insertValue}
                  onChange={(e) => setInsertValue(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleInsert()}
                  disabled={loading}
                />
                <Button onClick={handleInsert} disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Insert"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Search Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Key to search"
                    value={searchKey}
                    onChange={(e) => setSearchKey(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    disabled={loading}
                  />
                  <Button onClick={handleSearch} disabled={loading}>
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Search"
                    )}
                  </Button>
                </div>
                {searchResult !== null && (
                  <div className="p-3 bg-muted rounded-md">
                    <span className="font-mono">
                      {searchKey} →{" "}
                      {searchResult || (
                        <em className="text-muted-foreground">Not found</em>
                      )}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Range Query Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ListChecks className="w-4 h-4" />
                  Range Query
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Start key"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    disabled={loading}
                  />
                  <Input
                    placeholder="End key"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    disabled={loading}
                  />
                  <Button onClick={handleRangeQuery} disabled={loading}>
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Query"
                    )}
                  </Button>
                </div>
                {rangeResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Key</TableHead>
                          <TableHead>Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rangeResults.map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell className="font-mono">{key}</TableCell>
                            <TableCell>{value}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                All Entries ({entries.length})
              </h3>
              <Button
                onClick={refreshData}
                size="sm"
                variant="outline"
                disabled={loading}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>

            <div className="border rounded-lg max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Key</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell className="font-mono">{key}</TableCell>
                      <TableCell>{value}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(key)}
                          disabled={loading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-muted-foreground"
                      >
                        No data yet. Insert some entries to get started!
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Bulk Load Demo Data
                  </CardTitle>
                  <CardDescription>
                    Load 100 sample entries for testing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={handleBulkLoad}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading... {bulkLoadProgress.toFixed(0)}%
                      </>
                    ) : (
                      "Load Demo Data"
                    )}
                  </Button>
                  {bulkLoadProgress > 0 && (
                    <Progress value={bulkLoadProgress} className="mt-2" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    Clear All Data
                  </CardTitle>
                  <CardDescription>
                    Remove all entries from the B-tree
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={handleClear}
                    disabled={loading}
                    variant="destructive"
                    className="w-full"
                  >
                    Clear All Data
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileCog className="w-4 h-4" />
                    Verify Integrity
                  </CardTitle>
                  <CardDescription>
                    Check B-tree structure integrity
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={handleVerify}
                    disabled={loading}
                    variant="outline"
                    className="w-full"
                  >
                    Verify Tree
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            {stats && (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tree Structure</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Total Nodes:</dt>
                        <dd className="font-mono">{stats.nodeCount}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Tree Height:</dt>
                        <dd className="font-mono">{stats.height}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Key Count:</dt>
                        <dd className="font-mono">{stats.keyCount}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          Cache Hit Rate:
                        </dt>
                        <dd className="font-mono">
                          {(stats.cacheHitRate * 100).toFixed(2)}%
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Cached Nodes:</dt>
                        <dd className="font-mono">{stats.cachedNodes}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">File Size:</dt>
                        <dd className="font-mono">
                          {(stats.fileSize / 1024).toFixed(2)} KB
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Order: 32</Badge>
          <Badge variant="secondary">Cache: 100 nodes</Badge>
          <Badge variant="secondary">Persistent Storage</Badge>
        </div>
      </CardFooter>
    </Card>
  );
}
