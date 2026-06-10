import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function FAQ() {
  const faqs = [
    {
      q: "How does Report Factory AI generate content?",
      a: "We use advanced large language models fine-tuned specifically on business and financial documents. When you submit reference material and settings, the model synthesizes your data into the chosen structure while maintaining the requested tone and audience constraints."
    },
    {
      q: "Is my data secure?",
      a: "Yes. For our Pro and Enterprise tiers, we offer a strict zero data retention policy. Your data is processed in memory to generate the report and is immediately discarded. We never use your proprietary information to train our models."
    },
    {
      q: "What types of reports can I generate?",
      a: "Currently, we support Executive Summaries, Market Analyses, Risk Assessments, Competitive Analyses, Financial Reports, and Project Status Updates. We regularly add new templates based on user feedback."
    },
    {
      q: "Can I edit the reports after they are generated?",
      a: "Yes. All reports can be exported to DOCX format (on Pro plans) or copied as Markdown, allowing you to seamlessly paste them into Word, Google Docs, Notion, or any other editor for final polish."
    },
    {
      q: "How accurate are the chart suggestions?",
      a: "The chart suggestion engine analyzes the quantitative data points in your reference material. It recommends standard visualization types (e.g., bar charts for comparisons, line charts for trends over time) that best represent the narrative. You will still need to build the actual charts in your preferred tool (Excel, Tableau, etc.)."
    },
    {
      q: "Do you offer custom templates for our company?",
      a: "Yes, custom template development is available on our Enterprise plan. Our team will work with you to encode your company's specific formatting, branding, and structural guidelines into our engine."
    },
    {
      q: "What is the maximum amount of reference material I can provide?",
      a: "Free users can paste up to 5,000 words of context. Pro users can provide up to 25,000 words (equivalent to about 50 pages of text). Enterprise users have custom limits."
    },
    {
      q: "Can I cancel my subscription anytime?",
      a: "Yes, you can manage or cancel your subscription at any time from your account settings. If you cancel, you will retain access to your Pro features until the end of your current billing cycle."
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1">
        <section className="py-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Frequently Asked Questions</h1>
              <p className="text-xl text-muted-foreground">Everything you need to know about Report Factory AI.</p>
            </div>

            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-left text-lg font-medium" data-testid={`accordion-trigger-${i}`}>
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            
            <div className="mt-16 text-center p-8 bg-muted/50 rounded-xl border border-border">
              <h3 className="text-xl font-semibold mb-2">Still have questions?</h3>
              <p className="text-muted-foreground mb-6">Our support team is ready to help you with any specific inquiries.</p>
              <a href="mailto:support@example.com" className="text-primary font-medium hover:underline">
                Contact Support &rarr;
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
