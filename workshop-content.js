let contentPromise;

function requiredElement(source, selector) {
  const element = source.querySelector(selector);

  if (!element) {
    throw new Error(`Portfolio content is missing the required section: ${selector}`);
  }

  return element;
}

function createFragment(source, { product = false } = {}) {
  const fragment = document.createDocumentFragment();
  const content = document.importNode(source, true);

  if (product) {
    const heading = content.querySelector('h2');
    const headingContainer = heading?.parentElement;

    content.querySelector('.panel-kicker')?.remove();
    heading?.remove();

    if (headingContainer && !headingContainer.textContent.trim() && !headingContainer.children.length) {
      headingContainer.remove();
    }
  }

  fragment.append(content);
  fragment.querySelectorAll('script').forEach((script) => script.remove());
  fragment.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));

  return fragment;
}

async function readPortfolioContent() {
  const template = requiredElement(document, '#normal-template');

  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error('Portfolio content must be stored in the normal-template element.');
  }

  const source = template.content;
  const products = source.querySelectorAll('#products .product-card');

  if (products.length < 2) {
    throw new Error('Portfolio content is missing the Rew or TaskSeal product card.');
  }

  return {
    rew: createFragment(products[0], { product: true }),
    taskseal: createFragment(products[1], { product: true }),
    profile: createFragment(requiredElement(source, '#me .profile-grid')),
    projects: createFragment(requiredElement(source, '#projects .projects-grid')),
    skills: createFragment(requiredElement(source, '#skills .skills-grid')),
  };
}

// Clone a returned fragment before appending it so each station can be reopened.
export async function loadPortfolioContent() {
  if (!contentPromise) {
    contentPromise = readPortfolioContent().catch((error) => {
      contentPromise = undefined;
      throw error;
    });
  }

  return contentPromise;
}
