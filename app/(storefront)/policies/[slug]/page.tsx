import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POLICIES, getPolicy } from "@/lib/policies";
import styles from "../policies.module.css";

export function generateStaticParams() {
  return POLICIES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const policy = getPolicy(slug);
  return { title: policy ? policy.title : "Policy" };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) notFound();

  return (
    <div className={`page-width ${styles.page}`}>
      <h1 className={styles.title}>{policy.title}</h1>
      <p className={styles.updated}>Last updated {policy.updated}</p>
      <p className={styles.draftNote}>
        Draft — review before publishing. This is a template, not legal advice.
      </p>
      {policy.sections.map((section, i) => (
        <section key={i} className={styles.section}>
          {section.heading && <h2 className={styles.sectionHeading}>{section.heading}</h2>}
          {section.paragraphs.map((paragraph, j) => (
            <p key={j}>{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
