import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import ModelPerformanceSection from "@/components/ModelPerformanceSection";
import DashboardsSection from "@/components/DashboardsSection";
import TraitsSection from "@/components/TraitsSection";
import DiagnosisSection from "@/components/DiagnosisSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <ModelPerformanceSection />
      <DashboardsSection />
      <TraitsSection />
      <DiagnosisSection />
      <CTASection />
      <Footer />
    </main>
  );
};

export default Index;
