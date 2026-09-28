import { Request, Response } from 'express';
import PDFMerger from 'pdf-merger-js';
import puppeteer from 'puppeteer';
import { createPDFServiceToken } from './serviceToken';
import { createContext } from './context';
import { Project } from '../models/Project';
import config from '../config';

export const getPdf = async (req: Request, res: Response): Promise<any> => {
    // Use query parameters only - no path-based routing
    const pdfBaseUrl: string = config.pdf.frontendUrl;
    console.info('=== PDF GENERATION START ===');
    console.info('Project slug:', req.params.slug);
    console.info('Environment:', config.nodeEnv);
    console.info('PDF Base URL:', pdfBaseUrl);

    const { user } = await createContext({req});
    const project = await Project.findOne({ slug: req.params.slug });
    if (!project) {
        return res.status(404).send('Project not found');
    }
    const serviceToken = createPDFServiceToken(project.id, user.id);
    console.info('Token: ' + serviceToken);

    // Generate filename with date and concept status
    const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const conceptPrefix = project.status === 'DRAFT' ? '-concept' : '';
    // Sanitize filename to ensure browser compatibility
    const sanitizedSlug = req.params.slug.replace(/[^a-zA-Z0-9-_]/g, '-');
    const filename = `${currentDate}${conceptPrefix}-${sanitizedSlug}.pdf`;

    // Simplified configuration - fast and reliable
    const pageTimeout = 3000; // 2 seconds max - if --dump-dom works, page loads quickly
    const renderDelay = 350; // 350 milliseconds for React to render

    // Generate unique cache directory for this PDF generation request
    const cacheDir = `/tmp/puppeteer-cache-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    console.info('Using cache directory:', cacheDir);

    const browser = await puppeteer.launch({
        executablePath: config.pdf.browserExecutablePath,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-plugins',
            `--user-data-dir=${cacheDir}`,
            '--disk-cache-size=50000000',
            '--media-cache-size=50000000',
        ],
    });
    console.info('Puppeteer launched with executable path: ' + config.pdf.browserExecutablePath);

    try {
        const merger = new PDFMerger();
        const page = await browser.newPage();
        console.info('New page created');

        // Enable console logging from the page
        page.on('console', msg => {
            console.info('PAGE CONSOLE:', msg.type(), msg.text());
        });

        // Log page errors
        page.on('pageerror', error => {
            console.error('PAGE ERROR:', error.message);
        });

        // Log failed requests
        page.on('requestfailed', request => {
            console.error('REQUEST FAILED:', request.url(), request.failure()?.errorText);
        });

        // Log successful requests (for debugging)
        page.on('response', response => {
            console.info('RESPONSE:', response.status(), response.url());
        });

        // First, get the total page count from the frontend
        // Pass all parameters via query string
        let initialUrl = `${pdfBaseUrl}?slug=${encodeURIComponent(req.params.slug)}&page=0&token=${encodeURIComponent(serviceToken)}`;
        console.info('Getting total pages from: ' + initialUrl);

        // Simple, fast page loading - no retries, no complex waiting
        console.info('Loading initial page to get total pages:', initialUrl);

        try {
            await page.goto(initialUrl, {
                waitUntil: 'domcontentloaded',
                timeout: pageTimeout
            });
            console.info('Initial page loaded successfully');
        } catch (error) {
            console.error('Failed to load initial page:', error);
            throw error;
        }

        // Give React a moment to render, then get total pages
        console.info('⏱Waiting for React to render...');
        await new Promise(resolve => setTimeout(resolve, renderDelay));

        // Wait for .editor-preview but don't fail if it takes too long
        try {
            await page.waitForSelector('.editor-preview', { timeout: 2000 });
            console.info('React .editor-preview found');
        } catch (error) {
            console.info('.editor-preview not found within 2s, continuing anyway');
        }

        const pageInfo = await page.evaluate(() => {
            // Debug: log what we can see on the page
            const html = document.documentElement.outerHTML;
            const bodyText = document.body?.innerText || 'NO BODY TEXT';
            const title = document.title || 'NO TITLE';

            // Get total pages from the PdfRenderer component
            const totalPagesElement = document.querySelector('[data-total-pages]');
            let totalPages = 0;

            if (totalPagesElement) {
                const totalPagesAttr = totalPagesElement.getAttribute('data-total-pages');
                if (totalPagesAttr) {
                    totalPages = parseInt(totalPagesAttr, 10);
                }
            }

            // Fallback: try to get it from window object if exposed
            if (totalPages === 0) {
                totalPages = (window as any).totalCalculatedPages || 12; // fallback to 12
            }

            return {
                totalPages,
                title,
                bodyLength: bodyText.length,
                htmlLength: html.length,
                hasDataElement: !!totalPagesElement,
                bodyText: bodyText.substring(0, 200) // First 200 chars
            };
        });

        const totalPages = pageInfo.totalPages;

        if (totalPages === 0) {
            throw new Error('Could not determine total pages from PDF frontend');
        }

        console.info(`Total pages to generate: ${totalPages}`);

        let pageNumber = 0;
        // Generate each page - simple and fast
        while (pageNumber < totalPages) {
            // Include all parameters in query string
            let pagedUrl = `${pdfBaseUrl}?slug=${encodeURIComponent(req.params.slug)}&page=${pageNumber}&token=${encodeURIComponent(serviceToken)}`;
            console.info(`Generating page ${pageNumber + 1}/${totalPages}: ${pagedUrl}`);

            // Simple page load - no retries, fast timeouts
            await page.goto(pagedUrl, {
                waitUntil: 'domcontentloaded',
                timeout: pageTimeout
            });

            // Give React a moment to render the page content
            await new Promise(resolve => setTimeout(resolve, renderDelay));

            // Wait for .editor-preview but don't fail if it takes too long
            try {
                await page.waitForSelector('.editor-preview', { timeout: 2000 });
                console.info(`Page ${pageNumber + 1} .editor-preview found`);
            } catch (error) {
                console.info(`Page ${pageNumber + 1} .editor-preview not found within 2s, continuing anyway`);
            }

            // The front page's circular graph draws (via d3) only after its icons load
            // asynchronously. The page's negative-margin layout depends on the graph
            // having its real content before capture — otherwise the legend/key-message
            // overlap the heading. Wait for d3 to append its <g>, but don't block forever.
            if (pageNumber === 0) {
                try {
                    await page.waitForFunction(
                        () => !!document.querySelector('.chart-wrapper svg g'),
                        { timeout: 5000 }
                    );
                    console.info('Front-page circular graph rendered');
                } catch (error) {
                    console.info('Front-page circular graph not ready within 5s, continuing anyway');
                }
            }

            // Web fonts affect text metrics and layout — make sure they're ready.
            try {
                await page.evaluate(async () => { await document.fonts.ready; });
            } catch (error) {
                console.info('document.fonts.ready unavailable, continuing anyway');
            }

            // Force white background for PDF generation and ensure CSS variables work
            await page.evaluate(() => {
                // Set white background on all relevant containers
                document.body.style.backgroundColor = 'white';

                // Target all PDF-relevant containers
                const containers = [
                    '.editor-preview',
                    '.react-transform-wrapper',
                    '.react-transform-component',
                    '.transformcomponent-page'
                ];

                containers.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        (element as HTMLElement).style.backgroundColor = 'white';
                    });
                });

                // Ensure CSS variables are defined (fallback)
                const root = document.documentElement;
                const style = getComputedStyle(root);

                // Check if key CSS variables are available, add fallbacks if not
                if (!style.getPropertyValue('--white').trim()) {
                    root.style.setProperty('--white', '#fff');
                }
                if (!style.getPropertyValue('--neutral-grey-2').trim()) {
                    root.style.setProperty('--neutral-grey-2', '#bebebe');
                }
                if (!style.getPropertyValue('--black').trim()) {
                    root.style.setProperty('--black', '#000');
                }
            });

            // Generate PDF immediately - trust that content is ready
            let pdf = await page.pdf({
                width: '1220px',
                height: '1754px',
                scale: 0.5,
                printBackground: true,
            });
            await merger.add(pdf);

            console.info(`Page ${pageNumber + 1} generated successfully`);
            pageNumber++;
        }
        console.info('All pages processed successfully, merging PDFs...');

        const pdfBuffer = await merger.saveAsBuffer();

        // Set proper headers for PDF download with correct encoding
        res.contentType('application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader('Content-Length', pdfBuffer.length.toString());
        res.status(200).send(pdfBuffer);

        console.info(`PDF generated successfully: ${filename} (${pdfBuffer.length} bytes)`);
    } catch (err) {
        console.error('PDF generation error:', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).send(`Error generating PDF: ${errorMessage}`);
    } finally {
        await browser.close();
        console.info('Browser closed');
    }
};
