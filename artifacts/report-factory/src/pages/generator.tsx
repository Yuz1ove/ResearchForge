import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Settings, 
  Wand2, 
  ChevronRight, 
  ChevronLeft,
  Clock,
  Download,
  Copy,
  PieChart,
  BarChart,
  LineChart,
  Loader2
} from "lucide-react";
import { useState } from "react";

export function Generator() {
  const { toast } = useToast();
  
  // State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  
  // Form Data
  const [formData, setFormData] = useState({
    topic: "",
    type: "Executive Summary",
    audience: "Management Team",
    wordCount: "~1000 words",
    tone: "Formal & Professional",
    includeDataSources: true,
    includeCharts: true,
    referenceMaterial: ""
  });

  const updateForm = (key: keyof typeof formData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (step === 1 && !formData.topic.trim()) {
      toast({
        title: "Missing Topic",
        description: "Please enter a report topic to continue.",
        variant: "destructive"
      });
      return;
    }
    setStep(prev => Math.min(prev + 1, 3) as 1 | 2 | 3);
  };

  const handleBack = () => {
    setStep(prev => Math.max(prev - 1, 1) as 1 | 2 | 3);
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    setHasGenerated(false);
    
    // Simulate generation delay
    setTimeout(() => {
      setIsGenerating(false);
      setHasGenerated(true);
    }, 2500);
  };

  const handleExportPro = (format: string) => {
    toast({
      title: "Coming soon",
      description: `${format} export will be available in the Pro plan.`,
    });
  };

  const handleCopyMarkdown = () => {
    const markdown = `# ${formData.topic || "Untitled Report"}
**Type:** ${formData.type} | **Audience:** ${formData.audience} | **Date:** ${new Date().toLocaleDateString()}

## Executive Summary
This report analyzes ${formData.topic || "the subject matter"} for ${formData.audience}. The findings indicate significant opportunities for optimization and strategic growth in the upcoming quarter. Immediate action is recommended on the key risk factors identified.

## Background & Context
The current market conditions necessitate a thorough review of our approach. Based on the provided reference material, it is clear that historical trends are shifting. Our objective is to realign our strategy to capture emerging value pools while mitigating downside risk.

## Key Findings / Action Steps
1. Immediate resource reallocation to high-growth segments
2. Establish a cross-functional task force for implementation
3. Revise Q3 projections based on new market data
4. Initiate vendor renegotiations
5. Deploy updated reporting frameworks

## Conclusion
In conclusion, addressing these points will position the organization favorably. Continued monitoring of the key performance indicators is required.`;

    navigator.clipboard.writeText(markdown);
    toast({
      title: "Copied to clipboard",
      description: "Markdown version of the report has been copied.",
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl flex flex-col lg:flex-row gap-6 h-[calc(100vh-80px)]">
        
        {/* LEFT SIDEBAR - Step Tracker */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-6">
          <Card className="border-border shadow-sm">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">Progress</h3>
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${step >= 1 ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-muted text-muted-foreground'} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors`}>
                    <span className="text-xs font-bold">1</span>
                  </div>
                  <div className={`ml-4 md:ml-0 md:w-[calc(100%-2rem)] md:group-even:pl-4 md:group-odd:pr-4 text-sm font-medium ${step >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Setup
                  </div>
                </div>

                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${step >= 2 ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-muted text-muted-foreground'} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors`}>
                    <span className="text-xs font-bold">2</span>
                  </div>
                  <div className={`ml-4 md:ml-0 md:w-[calc(100%-2rem)] md:group-even:pl-4 md:group-odd:pr-4 text-sm font-medium ${step >= 2 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Content
                  </div>
                </div>

                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${step >= 3 ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-muted text-muted-foreground'} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors`}>
                    <span className="text-xs font-bold">3</span>
                  </div>
                  <div className={`ml-4 md:ml-0 md:w-[calc(100%-2rem)] md:group-even:pl-4 md:group-odd:pr-4 text-sm font-medium ${step >= 3 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Generate
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm hidden lg:block">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Recent Reports
              </h3>
              <div className="space-y-3">
                <div className="text-sm p-2 rounded-md hover:bg-muted cursor-pointer transition-colors border border-transparent hover:border-border">
                  <div className="font-medium truncate">Q3 Earnings Overview</div>
                  <div className="text-xs text-muted-foreground mt-1">Financial Report • Yesterday</div>
                </div>
                <div className="text-sm p-2 rounded-md hover:bg-muted cursor-pointer transition-colors border border-transparent hover:border-border">
                  <div className="font-medium truncate">Competitor SWOT</div>
                  <div className="text-xs text-muted-foreground mt-1">Competitive Analysis • 3 days ago</div>
                </div>
                <div className="text-sm p-2 rounded-md hover:bg-muted cursor-pointer transition-colors border border-transparent hover:border-border">
                  <div className="font-medium truncate">IT Infrastructure Migration</div>
                  <div className="text-xs text-muted-foreground mt-1">Project Status • Last week</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CENTER FORM AREA */}
        <div className="flex-1 flex flex-col gap-4">
          <Card className="flex-1 flex flex-col border-border shadow-sm overflow-hidden h-full">
            
            {/* Form Header */}
            <div className="p-5 border-b border-border bg-card">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {step === 1 && <><FileText className="h-5 w-5 text-primary"/> Report Setup</>}
                {step === 2 && <><Settings className="h-5 w-5 text-primary"/> Content Settings</>}
                {step === 3 && <><Wand2 className="h-5 w-5 text-primary"/> Review & Generate</>}
              </h2>
            </div>

            {/* Form Content */}
            <div className="p-6 flex-1 overflow-y-auto bg-card">
              
              {/* Step 1 */}
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-2">
                    <Label htmlFor="topic">Report Topic <span className="text-destructive">*</span></Label>
                    <Input 
                      id="topic" 
                      placeholder="e.g. Q4 Marketing Campaign Results" 
                      value={formData.topic}
                      onChange={(e) => updateForm("topic", e.target.value)}
                      data-testid="input-topic"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="type">Report Type</Label>
                    <Select value={formData.type} onValueChange={(val) => updateForm("type", val)}>
                      <SelectTrigger id="type" data-testid="select-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Executive Summary">Executive Summary</SelectItem>
                        <SelectItem value="Market Analysis">Market Analysis</SelectItem>
                        <SelectItem value="Risk Assessment">Risk Assessment</SelectItem>
                        <SelectItem value="Competitive Analysis">Competitive Analysis</SelectItem>
                        <SelectItem value="Financial Report">Financial Report</SelectItem>
                        <SelectItem value="Project Status Update">Project Status Update</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="audience">Target Audience</Label>
                    <Select value={formData.audience} onValueChange={(val) => updateForm("audience", val)}>
                      <SelectTrigger id="audience" data-testid="select-audience">
                        <SelectValue placeholder="Select audience" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Board of Directors">Board of Directors</SelectItem>
                        <SelectItem value="Investors">Investors</SelectItem>
                        <SelectItem value="Management Team">Management Team</SelectItem>
                        <SelectItem value="Clients">Clients</SelectItem>
                        <SelectItem value="General Public">General Public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="wordCount">Target Length</Label>
                    <Select value={formData.wordCount} onValueChange={(val) => updateForm("wordCount", val)}>
                      <SelectTrigger id="wordCount" data-testid="select-wordcount">
                        <SelectValue placeholder="Select length" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="~500 words">~500 words (Brief)</SelectItem>
                        <SelectItem value="~1000 words">~1000 words (Standard)</SelectItem>
                        <SelectItem value="~2000 words">~2000 words (Detailed)</SelectItem>
                        <SelectItem value="~3000 words">~3000 words (Comprehensive)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Step 2 */}
              {step === 2 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-3">
                    <Label>Tone & Style</Label>
                    <RadioGroup 
                      value={formData.tone} 
                      onValueChange={(val) => updateForm("tone", val)}
                      className="grid grid-cols-1 md:grid-cols-2 gap-3"
                    >
                      {[
                        "Formal & Professional", 
                        "Analytical & Data-Driven", 
                        "Persuasive & Strategic", 
                        "Neutral & Objective"
                      ].map((t) => (
                        <div key={t} className={`flex items-center space-x-2 border rounded-md p-3 cursor-pointer transition-colors ${formData.tone === t ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                          <RadioGroupItem value={t} id={`tone-${t}`} data-testid={`radio-tone-${t.replace(/\s+/g, '-').toLowerCase()}`} />
                          <Label htmlFor={`tone-${t}`} className="cursor-pointer font-normal w-full">{t}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                  
                  <div className="space-y-4 p-4 border rounded-md bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Include Data Sources</Label>
                        <div className="text-xs text-muted-foreground">Extract and append a list of citations</div>
                      </div>
                      <Switch 
                        checked={formData.includeDataSources} 
                        onCheckedChange={(val) => updateForm("includeDataSources", val)}
                        data-testid="switch-datasources"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Chart Suggestions</Label>
                        <div className="text-xs text-muted-foreground">Recommend visualizations for key data points</div>
                      </div>
                      <Switch 
                        checked={formData.includeCharts} 
                        onCheckedChange={(val) => updateForm("includeCharts", val)}
                        data-testid="switch-charts"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2 h-48 flex flex-col">
                    <Label htmlFor="reference">Reference Material <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                    <Textarea 
                      id="reference" 
                      placeholder="Paste any background context, data points, meeting notes, or source material here..." 
                      className="flex-1 resize-none"
                      value={formData.referenceMaterial}
                      onChange={(e) => updateForm("referenceMaterial", e.target.value)}
                      data-testid="textarea-reference"
                    />
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col h-full">
                  <div className="bg-muted p-5 rounded-lg border border-border">
                    <h3 className="font-semibold mb-4 text-foreground">Configuration Summary</h3>
                    
                    <dl className="space-y-3 text-sm">
                      <div className="grid grid-cols-3 gap-2">
                        <dt className="text-muted-foreground">Topic</dt>
                        <dd className="col-span-2 font-medium text-foreground">{formData.topic}</dd>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <dt className="text-muted-foreground">Type</dt>
                        <dd className="col-span-2 font-medium text-foreground">{formData.type}</dd>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <dt className="text-muted-foreground">Audience</dt>
                        <dd className="col-span-2 font-medium text-foreground">{formData.audience}</dd>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <dt className="text-muted-foreground">Length</dt>
                        <dd className="col-span-2 font-medium text-foreground">{formData.wordCount}</dd>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <dt className="text-muted-foreground">Tone</dt>
                        <dd className="col-span-2 font-medium text-foreground">{formData.tone}</dd>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <dt className="text-muted-foreground">Extras</dt>
                        <dd className="col-span-2 font-medium text-foreground flex gap-2">
                          {formData.includeDataSources && <Badge variant="secondary" className="font-normal text-xs">Citations</Badge>}
                          {formData.includeCharts && <Badge variant="secondary" className="font-normal text-xs">Charts</Badge>}
                          {!formData.includeDataSources && !formData.includeCharts && "None"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  
                  <div className="flex-1 flex items-center justify-center mt-4">
                    <Button 
                      size="lg" 
                      className="w-full h-16 text-lg" 
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      data-testid="button-generate"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-6 w-6 animate-spin" /> 
                          Synthesizing Report...
                        </>
                      ) : (
                        <>
                          <Wand2 className="mr-2 h-6 w-6" /> 
                          Generate Report
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

            </div>

            {/* Form Footer / Navigation */}
            <div className="p-4 border-t border-border bg-muted/10 flex justify-between">
              <Button 
                variant="outline" 
                onClick={handleBack} 
                disabled={step === 1 || isGenerating}
                data-testid="button-back"
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              
              {step < 3 && (
                <Button onClick={handleNext} data-testid="button-next">
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT PREVIEW PANE */}
        <div className="w-full lg:w-[45%] xl:w-1/2 flex flex-col h-[600px] lg:h-full shrink-0">
          <Card className="flex-1 border-border shadow-sm flex flex-col overflow-hidden bg-card">
            
            {/* Empty State */}
            {!hasGenerated && !isGenerating && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground animate-in fade-in duration-500">
                <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                  <FileText className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Report Preview</h3>
                <p className="max-w-xs text-sm">Configure your settings and click generate. Your formatted report will appear here.</p>
              </div>
            )}

            {/* Loading State */}
            {isGenerating && (
              <div className="flex-1 p-8 space-y-6 animate-pulse bg-card">
                <div className="h-8 bg-muted rounded w-3/4 mb-8"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-5/6"></div>
                </div>
                <div className="space-y-3 pt-6">
                  <div className="h-5 bg-muted rounded w-1/3 mb-4"></div>
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-4/5"></div>
                </div>
              </div>
            )}

            {/* Generated Report */}
            {hasGenerated && !isGenerating && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500 bg-card">
                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                  
                  {/* Header */}
                  <div className="border-b border-border pb-6 mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                      {formData.topic || "Untitled Report"}
                    </h1>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="font-normal">{formData.type}</Badge>
                      <Badge variant="outline" className="font-normal">For: {formData.audience}</Badge>
                      <Badge variant="outline" className="font-normal">{new Date().toLocaleDateString()}</Badge>
                    </div>
                  </div>

                  <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground">
                    
                    <h3>Executive Summary</h3>
                    <p>
                      This report provides a comprehensive analysis of {formData.topic || "the subject matter"} tailored specifically for the {formData.audience}. In evaluating the current landscape, several critical insights have emerged that warrant immediate attention.
                    </p>
                    <p>
                      Our findings indicate significant opportunities for optimization and strategic growth in the upcoming quarter. By adopting a {formData.tone.toLowerCase()} approach, the organization can better align its resources with emerging market demands.
                    </p>

                    <h3>Background & Context</h3>
                    <p>
                      The current conditions necessitate a thorough review of our operational framework. Based on the provided reference material and historical precedents, it is clear that prevailing trends are shifting. Our primary objective is to realign our strategy to capture value pools while mitigating downside risk associated with market volatility.
                    </p>

                    <h3>Key Findings / Action Steps</h3>
                    <ol>
                      <li><strong>Immediate Resource Reallocation:</strong> Shift focus to high-growth segments identified in Q2.</li>
                      <li><strong>Establish Task Force:</strong> Create a cross-functional team to oversee implementation within 14 days.</li>
                      <li><strong>Revise Projections:</strong> Update Q3 and Q4 forecasts based on the newly acquired data points.</li>
                      <li><strong>Vendor Renegotiations:</strong> Initiate contact with primary suppliers to secure better terms.</li>
                      <li><strong>Reporting Frameworks:</strong> Deploy updated dashboards to track progress against new KPIs.</li>
                    </ol>

                    <h3>Risk Analysis</h3>
                    <div className="not-prose space-y-3 my-6">
                      <div className="flex items-start gap-3 p-3 border rounded-md bg-muted/20">
                        <Badge variant="destructive" className="mt-0.5">High</Badge>
                        <div className="text-sm">
                          <span className="font-medium text-foreground block">Supply Chain Disruption</span>
                          <span className="text-muted-foreground">Potential delays in key component delivery over the next 45 days.</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 border rounded-md bg-muted/20">
                        <Badge className="bg-amber-500 hover:bg-amber-600 mt-0.5">Medium</Badge>
                        <div className="text-sm">
                          <span className="font-medium text-foreground block">Competitor Response</span>
                          <span className="text-muted-foreground">Expected price matching from tier-1 competitors within the quarter.</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 border rounded-md bg-muted/20">
                        <Badge className="bg-green-500 hover:bg-green-600 mt-0.5">Low</Badge>
                        <div className="text-sm">
                          <span className="font-medium text-foreground block">Regulatory Changes</span>
                          <span className="text-muted-foreground">Minor compliance updates required by year-end.</span>
                        </div>
                      </div>
                    </div>

                    <h3>Conclusion</h3>
                    <p>
                      In conclusion, addressing these strategic imperatives will position the organization favorably against near-term headwinds. Continued monitoring of the key performance indicators outlined in this document is required to ensure sustained success.
                    </p>

                    {formData.includeDataSources && (
                      <>
                        <h3 className="border-t border-border pt-6 mt-8">Data Sources & Citations</h3>
                        <ul className="text-xs text-muted-foreground">
                          <li>Internal Q2 Performance Metrics (Financial DB)</li>
                          <li>Industry Benchmark Report (Gartner, 2023)</li>
                          <li>Customer Feedback Survey (May Cohort)</li>
                        </ul>
                      </>
                    )}

                    {formData.includeCharts && (
                      <>
                        <h3 className="border-t border-border pt-6 mt-8">Chart Recommendations</h3>
                        <div className="not-prose grid grid-cols-1 gap-3 mt-4">
                          <div className="flex items-center gap-3 p-3 border rounded-md bg-background">
                            <div className="p-2 bg-primary/10 text-primary rounded"><BarChart className="h-4 w-4"/></div>
                            <div>
                              <div className="text-sm font-medium">Revenue by Segment (Bar Chart)</div>
                              <div className="text-xs text-muted-foreground">To illustrate the disproportionate growth in enterprise accounts.</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 border rounded-md bg-background">
                            <div className="p-2 bg-primary/10 text-primary rounded"><LineChart className="h-4 w-4"/></div>
                            <div>
                              <div className="text-sm font-medium">User Acquisition Trend (Line Chart)</div>
                              <div className="text-xs text-muted-foreground">Showing the month-over-month trajectory since campaign launch.</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 border rounded-md bg-background">
                            <div className="p-2 bg-primary/10 text-primary rounded"><PieChart className="h-4 w-4"/></div>
                            <div>
                              <div className="text-sm font-medium">Market Share Breakdown (Pie Chart)</div>
                              <div className="text-xs text-muted-foreground">Visualizing current positioning against the top 3 competitors.</div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                  </div>
                </div>

                {/* Export Toolbar */}
                <div className="p-4 border-t border-border bg-muted/30 flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExportPro("PDF")} data-testid="button-export-pdf">
                      <Download className="mr-2 h-4 w-4" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportPro("DOCX")} data-testid="button-export-docx">
                      <Download className="mr-2 h-4 w-4" /> DOCX
                    </Button>
                  </div>
                  <Button variant="default" size="sm" onClick={handleCopyMarkdown} data-testid="button-copy-markdown">
                    <Copy className="mr-2 h-4 w-4" /> Copy Markdown
                  </Button>
                </div>

              </div>
            )}
            
          </Card>
        </div>

      </main>
    </div>
  );
}
