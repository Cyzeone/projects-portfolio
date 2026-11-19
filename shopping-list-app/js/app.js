/* =================================
   1. ELEMENTOS DA INTERFACE
================================= */

const screens = {
  home: document.getElementById("home-screen"),
  "new-purchase": document.getElementById("new-purchase-screen"),
  shopping: document.getElementById("shopping-screen"),
  history: document.getElementById("history-screen")
};

const navItems = document.querySelectorAll(".nav-item");
const toast = document.getElementById("toast");

const productForm = document.getElementById("product-form");
const productList = document.getElementById("product-list");

const nameInput = document.getElementById("product-name");
const quantityInput = document.getElementById("product-quantity");
const priceInput = document.getElementById("product-price");
const categoryInput = document.getElementById("product-category");

const productCount = document.getElementById("product-count");

const purchaseTotal = document.getElementById("purchase-total");
const purchaseTotalLabel = document.getElementById("purchase-total-label");
const missingPriceCount = document.getElementById("missing-price-count");

const finishButton = document.getElementById("finish-purchase");

const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");
const historyCount = document.getElementById("history-count");

// Elementos do card de compra em andamento
const ongoingPurchaseCard = document.getElementById("ongoing-purchase-card");
const ongoingPurchaseSummary = document.getElementById("ongoing-purchase-summary");

// Elementos do modal de detalhes da compra
const purchaseModal = document.getElementById("purchase-modal");
const purchaseModalDate = document.getElementById("purchase-modal-date");
const purchaseModalProducts = document.getElementById("purchase-modal-products");
const purchaseModalTotalLabel = document.getElementById("purchase-modal-total-label");
const purchaseModalTotal = document.getElementById("purchase-modal-total");

const closePurchaseModalButton = document.getElementById("close-purchase-modal");
const closePurchaseModalBackdrop = document.getElementById("close-purchase-modal-backdrop");


/* =================================
   2. DADOS DA COMPRA
================================= */

// Produtos da compra atualmente aberta.
let products = [];

let purchaseStarted = false;
let toastTimeout;
let purchaseFinalizing = false;

// Identificação da compra atualmente aberta.
let currentDraftId = null;
let currentDraftType = null;
let currentDraftCreatedAt = null;

// Organiza as gravações para evitar conflitos.
let draftSaveQueue = Promise.resolve();

let latestPurchase = null;


/* =================================
   2.1. PERSISTÊNCIA DOS RASCUNHOS
================================= */

// Identificador utilizado pela versão antiga.
const ACTIVE_DRAFT_ID = "active-purchase";


// Gera identificadores únicos para novos rascunhos.

function generateDraftId() {

  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

}


// Cria uma cópia dos produtos sem dados temporários da interface.

function getProductsSnapshot() {

  return products.map(product => ({

    id: product.id,
    name: product.name,
    quantity: product.quantity,
    price: product.price,
    category: product.category,
    purchased: product.purchased

  }));

}


// Salva a compra atualmente aberta no IndexedDB.

function saveCurrentDraft() {

  if (!purchaseStarted) {
    return Promise.resolve(false);
  }

  // Captura o identificador e os dados imediatamente.
  // Assim, trocar de compra não altera uma gravação pendente.

  const now = new Date().toISOString();

  if (!currentDraftId) {
    currentDraftId = ACTIVE_DRAFT_ID;
  }

  if (!currentDraftType) {
    currentDraftType = "empty";
  }

  if (!currentDraftCreatedAt) {
    currentDraftCreatedAt = now;
  }

  const draft = {

    id: currentDraftId,
    type: currentDraftType,
    products: getProductsSnapshot(),
    createdAt: currentDraftCreatedAt,
    updatedAt: now

  };

  const saveOperation = draftSaveQueue.then(async () => {

    await window.databaseReady;

    if (!window.database || !window.database.connection) {
      throw new Error("Banco de dados indisponível.");
    }

    await window.database.update("drafts", draft);

    renderOngoingPurchaseCard(draft);

    console.log("Rascunho salvo:", draft.id);

    return true;

  }).catch(error => {

    console.error("Erro ao salvar rascunho:", error);

    showToast("Não foi possível salvar a compra.");

    return false;

  });

  draftSaveQueue = saveOperation;

  return saveOperation;

}


// Carrega um rascunho específico pelo identificador.

async function loadDraft(draftId) {

  try {

    // Garante que as gravações anteriores terminaram.
    await draftSaveQueue;

    await window.databaseReady;

    if (!window.database || !window.database.connection) {
      throw new Error("Banco de dados indisponível.");
    }

    const draft = await window.database.get(
      "drafts",
      draftId
    );

    if (!draft) {
      return false;
    }

    // Recupera os dados da compra.

    products = Array.isArray(draft.products)
      ? draft.products.map(product => ({

          ...product,
          editing: false

        }))
      : [];

    // Recupera a identificação e a origem.
    // Rascunhos antigos são considerados compras do zero.

    currentDraftId = draft.id;

    currentDraftType =
      draft.type || draft.source || "empty";

    currentDraftCreatedAt =
      draft.createdAt || draft.updatedAt || new Date().toISOString();

    purchaseStarted = true;

    renderProducts();

    renderOngoingPurchaseCard(draft);

    console.log("Rascunho recuperado:", draft.id);

    return true;

  } catch (error) {

    console.error("Erro ao recuperar rascunho:", error);

    showToast("Não foi possível recuperar a compra.");

    return false;

  }

}


// Recupera o rascunho antigo, se existir.
// Mantém a compatibilidade com versões anteriores.

async function loadCurrentDraft() {

  const recovered = await loadDraft(ACTIVE_DRAFT_ID);

  if (!recovered) {
    renderOngoingPurchaseCard(null);

    console.log("Nenhum rascunho antigo encontrado.");
  }

  return recovered;

}


// Cria uma nova compra independente.

async function createNewDraft(type = "empty") {

  const now = new Date().toISOString();

  currentDraftId = generateDraftId();
  currentDraftType = type;
  currentDraftCreatedAt = now;

  products = [];
  purchaseStarted = true;

  renderProducts();

  await saveCurrentDraft();

  console.log("Novo rascunho criado:", currentDraftId);

  return currentDraftId;

}


// Atualiza a apresentação da compra em andamento na tela inicial.

function renderOngoingPurchaseCard(draft) {

  if (!ongoingPurchaseCard || !ongoingPurchaseSummary) return;

  if (!draft) {

    ongoingPurchaseSummary.textContent =
      "Você tem uma lista não finalizada.";

    ongoingPurchaseCard.classList.add("hidden");

    return;
  }

  const draftProducts = Array.isArray(draft.products)
    ? draft.products
    : [];

  const count = draftProducts.length;

  if (count === 0) {

    ongoingPurchaseSummary.textContent =
      "Lista iniciada · Nenhum produto adicionado.";

  } else {

    ongoingPurchaseSummary.textContent =
      `${count} ${count === 1 ? "produto adicionado" : "produtos adicionados"}`;

  }

  ongoingPurchaseCard.classList.remove("hidden");

}


/* =================================
   2.2. ÚLTIMA COMPRA
================================= */

async function loadLatestPurchase() {
  try {
    await window.databaseReady;

    const purchases = await window.database.getAll("purchases");

    latestPurchase = purchases.sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    })[0] || null;

    const titleElement = document.getElementById(
      "latest-purchase-title"
    );

    const summaryElement = document.getElementById(
      "latest-purchase-summary"
    );

    if (!titleElement || !summaryElement) return;

    // Nenhuma compra registrada
    if (!latestPurchase) {
      titleElement.textContent = "—";

      summaryElement.textContent =
        "Nenhuma compra registrada ainda.";

      return;
    }

    const purchaseProducts = Array.isArray(latestPurchase.products)
      ? latestPurchase.products
      : [];

    const missingCount = purchaseProducts.filter(product =>
      isPriceMissing(product.price)
    ).length;

    const total = Number(latestPurchase.total) || 0;

    const date = new Date(latestPurchase.date);

    const formattedDate = date.toLocaleDateString("pt-BR");

    const count = purchaseProducts.length;

    // Apresentação do valor
    if (count > 0 && missingCount === count) {
      titleElement.textContent = "Indisponível";
    } else {
      titleElement.textContent = formatCurrency(total);
    }

    // Informações complementares
    let summary = `${formattedDate} · ${count} ${
      count === 1 ? "produto" : "produtos"
    }`;

    if (missingCount > 0) {
      summary += ` · ${
        missingCount === count
          ? "sem preços informados"
          : `total parcial · ${missingCount} sem preço`
      }`;
    }

    summaryElement.textContent = summary;

  } catch (error) {
    console.error("Erro ao carregar última compra:", error);
  }
}


async function loadHistory() {
  try {
    await window.databaseReady;

    const purchases = await window.database.getAll("purchases");

    // Organiza as compras da mais recente para a mais antiga.
    purchases.sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });

    historyList.innerHTML = "";

    if (purchases.length === 0) {
      historyCount.textContent = "";
      historyEmpty.classList.remove("hidden");
      return;
    }

    historyEmpty.classList.add("hidden");

    historyCount.textContent =
      `${purchases.length} ${purchases.length === 1 ? "compra registrada" : "compras registradas"}`;

    purchases.forEach(purchase => {
      const purchaseProducts = Array.isArray(purchase.products)
        ? purchase.products
        : [];

      const missingCount = purchaseProducts.filter(product =>
        isPriceMissing(product.price)
      ).length;

      const total = Number(purchase.total) || 0;
      const productTotal = purchaseProducts.length;

      const date = new Date(purchase.date);
      const formattedDate = date.toLocaleDateString("pt-BR");

      let totalText = "";

      if (productTotal > 0 && missingCount === productTotal) {
        totalText = "Indisponível";
      } else {
        totalText = formatCurrency(total);
      }
      
      const card = document.createElement("div");
      card.className = "history-item";

      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", `Consultar compra de ${formattedDate}`);

      // Abre os detalhes da compra correspondente.
      card.addEventListener("click", () => {
        openPurchaseDetails(purchase);
      });

      // Permite abrir o modal usando Enter ou Espaço.
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPurchaseDetails(purchase);
        }
      });

      const information = document.createElement("div");
      information.className = "history-item-info";

      const dateElement = document.createElement("h3");
      dateElement.textContent = formattedDate;

      const productsElement = document.createElement("p");
      productsElement.textContent =
        `${productTotal} ${productTotal === 1 ? "produto" : "produtos"}`;

      if (missingCount > 0) {
        const missingText = missingCount === productTotal
          ? "Sem preços informados"
          : `Total parcial · ${missingCount} sem preço`;

        productsElement.textContent += ` · ${missingText}`;
      }

      const totalElement = document.createElement("strong");
      totalElement.textContent = totalText;

      information.append(dateElement, productsElement);
      card.append(information, totalElement);

      historyList.appendChild(card);
    });

  } catch (error) {
    console.error("Erro ao carregar histórico:", error);
    showToast("Não foi possível carregar o histórico.");
  }
}

/* =================================
   3. FORMATAÇÃO DE VALORES
================================= */

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

// Verifica se um produto possui preço informado
function isPriceMissing(price) {
  return (
    price === null ||
    price === undefined ||
    price === ""
  );
}

/* =================================
   MODAL DE DETALHES DA COMPRA
================================= */

function openPurchaseDetails(purchase) {
  if (!purchase || !purchaseModal) return;

  const purchaseProducts = Array.isArray(purchase.products)
    ? purchase.products
    : [];

  const missingCount = purchaseProducts.filter(product =>
    isPriceMissing(product.price)
  ).length;

  const productTotal = purchaseProducts.length;
  const total = Number(purchase.total) || 0;

  // Atualiza a data da compra.
  const date = new Date(purchase.date);

  purchaseModalDate.textContent = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  // Limpa os produtos anteriores.
  purchaseModalProducts.innerHTML = "";

  // Cria os detalhes de cada produto.
  purchaseProducts.forEach(product => {
    const priceMissing = isPriceMissing(product.price);
    const quantity = Number(product.quantity) || 0;
    const price = priceMissing ? null : Number(product.price);

    const subtotal = priceMissing
      ? null
      : quantity * price;

    const productItem = document.createElement("div");
    productItem.className = "purchase-modal-product";

    const information = document.createElement("div");
    information.className = "purchase-modal-product-info";

    const name = document.createElement("strong");
    name.className = "purchase-modal-product-name";
    name.textContent = product.name || "Produto sem nome";

    const details = document.createElement("span");
    details.className = "purchase-modal-product-details";

    if (priceMissing) {
      details.textContent = `${quantity} un. · Preço não informado`;
    } else {
      details.textContent =
        `${quantity} un. · ${formatCurrency(price)} / un.`;
    }

    const subtotalElement = document.createElement("strong");
    subtotalElement.className = "purchase-modal-product-subtotal";
    subtotalElement.textContent = priceMissing
      ? "Sem preço"
      : formatCurrency(subtotal);

    information.append(name, details);
    productItem.append(information, subtotalElement);

    purchaseModalProducts.appendChild(productItem);
  });

  // Atualiza o total e identifica preços ausentes.
  if (productTotal > 0 && missingCount === productTotal) {
    purchaseModalTotalLabel.textContent = "Total indisponível";
    purchaseModalTotal.textContent = "Indisponível";
  } else if (missingCount > 0) {
    purchaseModalTotalLabel.textContent = "Total parcial";
    purchaseModalTotal.textContent = formatCurrency(total);
  } else {
    purchaseModalTotalLabel.textContent = "Total da compra";
    purchaseModalTotal.textContent = formatCurrency(total);
  }

  // Exibe o modal.
  purchaseModal.classList.remove("hidden");
  purchaseModal.setAttribute("aria-hidden", "false");

  document.body.classList.add("modal-open");
}

function closePurchaseDetails() {
  if (!purchaseModal) return;

  purchaseModal.classList.add("hidden");
  purchaseModal.setAttribute("aria-hidden", "true");

  document.body.classList.remove("modal-open");
}

// Fechar pelo botão X
closePurchaseModalButton.addEventListener("click", closePurchaseDetails);

// Fechar ao clicar no fundo escurecido
closePurchaseModalBackdrop.addEventListener("click", closePurchaseDetails);

// Fechar usando a tecla ESC
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !purchaseModal.classList.contains("hidden")) {
    closePurchaseDetails();
  }
});

/* =================================
   4. DATA ATUAL
================================= */

function updateDate() {
  const dateElement = document.getElementById("current-date");

  if (!dateElement) return;

  const today = new Date();

  const formattedDate = today.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });

  dateElement.textContent = formattedDate.toUpperCase();
}


/* =================================
   5. NAVEGAÇÃO ENTRE TELAS
================================= */

function showScreen(screenName) {

  Object.values(screens).forEach(screen => {
    if (screen) {
      screen.classList.add("hidden");
    }
  });

  if (!screens[screenName]) return;

  screens[screenName].classList.remove("hidden");

  // Atualiza o histórico sempre que a tela for aberta.
  if (screenName === "history") {
    loadHistory();
  }

  // Durante a compra, mantém Nova compra
  // como opção selecionada no menu.

  const activeNavigation =
    screenName === "shopping" ? "new-purchase" : screenName;

  navItems.forEach(item => {

    item.classList.remove("active");

    if (item.dataset.screen === activeNavigation) {
      item.classList.add("active");
    }

  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =================================
   6. MENU INFERIOR
================================= */

navItems.forEach(item => {

  item.addEventListener("click", () => {

    const selectedScreen = item.dataset.screen;

    showScreen(selectedScreen);

  });

});


/* =================================
   7. AVISOS
================================= */

function showToast(message) {

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);

}


/* =================================
   8. INICIAR UMA COMPRA
================================= */

async function startEmptyPurchase() {

  if (purchaseFinalizing) {
    showToast("Aguarde a finalização da compra.");
    return;
  }

  try {

    // Cria uma compra independente.
    await createNewDraft("empty");

    productForm.reset();
    quantityInput.value = 1;

    showScreen("shopping");

  } catch (error) {

    console.error("Erro ao iniciar compra:", error);

    showToast("Não foi possível iniciar a compra.");

  }

}


/* =================================
   8.1. RETOMAR COMPRA
================================= */

async function resumePurchase() {

  if (!currentDraftId) {

    showToast("Nenhuma compra em andamento selecionada.");

    return;

  }

  const recovered = await loadDraft(currentDraftId);

  if (!recovered) {

    showToast("Não foi possível recuperar esta compra.");

    return;

  }

  renderProducts();

  showScreen("shopping");

}

/* =================================
   9. ADICIONAR PRODUTOS
================================= */

productForm.addEventListener("submit", async event => {

  event.preventDefault();

  const name = nameInput.value.trim();
  const quantity = Number(quantityInput.value);

  // Preço vazio será armazenado como null.
  const priceText = priceInput.value.trim();

  const price = priceText === "" ? null : Number(priceText);

  const category = categoryInput.value;


  // Validação do nome

  if (!name) {

    showToast("Informe o nome do produto.");
    nameInput.focus();

    return;

  }


  // Validação da quantidade

  if (!Number.isInteger(quantity) || quantity < 1) {

    showToast("Informe uma quantidade válida.");
    quantityInput.focus();

    return;

  }


  // Validação do preço, quando informado

  if (
    price !== null &&
    (!Number.isFinite(price) || price < 0)
  ) {

    showToast("Informe um preço válido.");
    priceInput.focus();

    return;

  }


  // Criação do produto

  const product = {

    id: Date.now() + Math.random(),

    name,
    quantity,
    price,
    category,

    purchased: false,
    editing: false

  };


  products.push(product);

  purchaseStarted = true;

  renderProducts();


  // Limpa os campos para o próximo produto

  productForm.reset();

  quantityInput.value = 1;

  nameInput.focus();

  showToast("Produto adicionado!");

  // Salva a compra no banco

  await saveCurrentDraft();

});


/* =================================
   10. CRIAR CARTÃO DE PRODUTO
================================= */

function createProductCard(product) {

  const card = document.createElement("div");

  card.className = "product-card";

  if (product.purchased) {
    card.classList.add("completed");
  }


  // Checkbox

  const checkbox = document.createElement("input");

  checkbox.type = "checkbox";
  checkbox.className = "product-check";
  checkbox.checked = product.purchased;

  checkbox.setAttribute(
    "aria-label",
    `Marcar ${product.name} como comprado`
  );

  checkbox.addEventListener("change", async () => {

    product.purchased = checkbox.checked;

    renderProducts();

    // Salva a alteração no banco

    await saveCurrentDraft();

  });


  // Informações do produto

  const details = document.createElement("div");

  details.className = "product-details";


  const name = document.createElement("div");

  name.className = "product-name";
  name.textContent = product.name;


  const info = document.createElement("div");

  info.className = "product-info";

  info.textContent =
    `${product.category} · ${product.quantity} un.`;


  details.appendChild(name);
  details.appendChild(info);


  // Valores do produto

  const values = document.createElement("div");

  values.className = "product-values";


  const subtotal = document.createElement("div");

  subtotal.className = "product-subtotal";


  if (isPriceMissing(product.price)) {

    subtotal.textContent = "Sem preço";
    subtotal.classList.add("product-price-missing");

  } else {

    subtotal.textContent = formatCurrency(
      product.quantity * product.price
    );

  }


  // Botão de edição

  const editButton = document.createElement("button");

  editButton.type = "button";
  editButton.className = "edit-product";

  editButton.textContent =
    product.editing ? "Fechar edição" : "Editar";

  editButton.addEventListener("click", () => {

    product.editing = !product.editing;

    renderProducts();

  });


  // Botão de remoção

  const removeButton = document.createElement("button");

  removeButton.type = "button";
  removeButton.className = "remove-product";

  removeButton.textContent = "Remover";

  removeButton.addEventListener("click", async () => {

    const confirmed = window.confirm(
      `Deseja excluir "${product.name}" da lista?`
    );

    if (!confirmed) return;

    products = products.filter(item => item.id !== product.id);

    renderProducts();

    showToast("Produto removido.");

    // Atualiza o banco

    await saveCurrentDraft();

  });


  values.appendChild(subtotal);
  values.appendChild(editButton);
  values.appendChild(removeButton);


  // Montagem do cartão

  card.appendChild(checkbox);
  card.appendChild(details);
  card.appendChild(values);


  // Editor de produto

  if (product.editing) {

    const editForm = createEditForm(product);

    card.appendChild(editForm);

  }


  return card;

}


/* =================================
   11. FORMULÁRIO DE EDIÇÃO
================================= */

function createEditForm(product) {

  const form = document.createElement("form");

  form.className = "edit-product-form";


  // Campo quantidade

  const quantityLabel = document.createElement("label");

  quantityLabel.textContent = "Quantidade";


  const quantityInputEdit = document.createElement("input");

  quantityInputEdit.type = "number";
  quantityInputEdit.min = "1";
  quantityInputEdit.step = "1";
  quantityInputEdit.value = product.quantity;
  quantityInputEdit.required = true;

  quantityLabel.appendChild(quantityInputEdit);


  // Campo preço

  const priceLabel = document.createElement("label");

  priceLabel.textContent = "Preço unitário (opcional)";


  const priceInputEdit = document.createElement("input");

  priceInputEdit.type = "number";
  priceInputEdit.min = "0";
  priceInputEdit.step = "0.01";

  priceInputEdit.placeholder = "Deixe vazio se não souber";

  priceInputEdit.value =
    product.price === null ? "" : product.price;

  priceLabel.appendChild(priceInputEdit);


  // Botões

  const actions = document.createElement("div");

  actions.className = "edit-product-actions";


  const saveButton = document.createElement("button");

  saveButton.type = "submit";
  saveButton.className = "save-edit-button";
  saveButton.textContent = "Salvar";


  const cancelButton = document.createElement("button");

  cancelButton.type = "button";
  cancelButton.className = "cancel-edit-button";
  cancelButton.textContent = "Cancelar";


  cancelButton.addEventListener("click", () => {

    product.editing = false;

    renderProducts();

  });


  actions.appendChild(saveButton);
  actions.appendChild(cancelButton);


  // Montagem do formulário

  form.appendChild(quantityLabel);
  form.appendChild(priceLabel);
  form.appendChild(actions);


  // Salvar alterações

  form.addEventListener("submit", async event => {

    event.preventDefault();

    const newQuantity = Number(quantityInputEdit.value);

    const newPriceText = priceInputEdit.value.trim();

    const newPrice =
      newPriceText === "" ? null : Number(newPriceText);


    // Validação da quantidade

    if (!Number.isInteger(newQuantity) || newQuantity < 1) {

      showToast("Informe uma quantidade válida.");

      quantityInputEdit.focus();

      return;

    }


    // Validação do preço

    if (
      newPrice !== null &&
      (!Number.isFinite(newPrice) || newPrice < 0)
    ) {

      showToast("Informe um preço válido.");

      priceInputEdit.focus();

      return;

    }


    // Atualização do produto

    product.quantity = newQuantity;
    product.price = newPrice;

    product.editing = false;

    renderProducts();

    showToast("Produto atualizado!");

    // Salva as alterações no banco

    await saveCurrentDraft();

  });


  return form;

}


/* =================================
   12. EXIBIR PRODUTOS
================================= */

function renderProducts() {

  productList.innerHTML = "";


  // Quantidade de produtos

  const count = products.length;

  if (productCount) {

    productCount.textContent =
      `${count} ${count === 1 ? "produto" : "produtos"}`;

  }


  // Carrinho vazio

  if (count === 0) {

    const emptyMessage = document.createElement("div");

    emptyMessage.className = "empty-list";

    emptyMessage.innerHTML = `
      <span>🛒</span>
      <p>Sua lista está vazia.</p>
      <small>Adicione seu primeiro produto acima.</small>
    `;

    productList.appendChild(emptyMessage);

  }


  // Produtos adicionados

  products.forEach(product => {

    const card = createProductCard(product);

    productList.appendChild(card);

  });


  // Atualiza o total

  updatePurchaseTotal();

}


function updatePurchaseTotal() {

  // Identifica produtos sem preço.
  const productsWithoutPrice = products.filter(product =>
    isPriceMissing(product.price)
  );

  const missingCount = productsWithoutPrice.length;
  const totalProducts = products.length;

  // Soma apenas os produtos com preço informado.
  const total = products.reduce((sum, product) => {

    if (isPriceMissing(product.price)) {
      return sum;
    }

    return sum + (
      Number(product.quantity) * Number(product.price)
    );

  }, 0);

  // Nenhum produto na lista.
  if (totalProducts === 0) {

    purchaseTotal.textContent = formatCurrency(0);
    purchaseTotalLabel.textContent = "Total da compra";
    missingPriceCount.textContent = "";

    return;
  }

  // Nenhum preço informado.
  if (missingCount === totalProducts) {

    purchaseTotal.textContent = "Indisponível";
    purchaseTotalLabel.textContent = "Total da compra";

    missingPriceCount.textContent =
      `${missingCount} ${
        missingCount === 1
          ? "produto sem preço"
          : "produtos sem preço"
      }`;

    return;
  }

  // Atualiza o valor calculado.
  purchaseTotal.textContent = formatCurrency(total);

  // Existem preços faltando.
  if (missingCount > 0) {

    purchaseTotalLabel.textContent = "Total parcial";

    missingPriceCount.textContent =
      `${missingCount} ${
        missingCount === 1
          ? "produto sem preço"
          : "produtos sem preço"
      }`;

  } else {

    purchaseTotalLabel.textContent = "Total da compra";
    missingPriceCount.textContent = "";

  }

}


/* =================================
   14. FINALIZAR COMPRA
================================= */


/* =================================
   14. FINALIZAR COMPRA
================================= */

finishButton.addEventListener("click", async () => {

  // Impede finalizações simultâneas.
  if (purchaseFinalizing) return;

  if (!currentDraftId) {
    showToast("Nenhuma compra ativa para finalizar.");
    return;
  }

  // Guarda os dados da compra atual.
  const draftIdToFinalize = currentDraftId;
  const draftTypeToFinalize = currentDraftType || "empty";
  const productsToFinalize = getProductsSnapshot();

  // Impede finalizar uma compra vazia.
  if (productsToFinalize.length === 0) {
    showToast("Adicione pelo menos um produto.");
    return;
  }

  // Identifica produtos sem preço.
  const productsWithoutPrice = productsToFinalize.filter(product =>
    isPriceMissing(product.price)
  );

  // Pede confirmação quando existem preços faltando.
  if (productsWithoutPrice.length > 0) {

    const confirmed = window.confirm(
      `Existem ${productsWithoutPrice.length} produto(s) sem preço informado.\n\n` +
      "Deseja finalizar a compra mesmo assim?"
    );

    if (!confirmed) return;

  }

  // A partir daqui, a finalização está em andamento.
  purchaseFinalizing = true;

  // Evita alterações enquanto a compra é finalizada.
  finishButton.disabled = true;
  finishButton.textContent = "Finalizando...";

  productForm.querySelectorAll("input, select, button").forEach(control => {
    control.disabled = true;
  });

  productList.querySelectorAll("input, button").forEach(control => {
    control.disabled = true;
  });

  try {

    // Aguarda todas as gravações pendentes do rascunho.
    await draftSaveQueue;

    const purchaseDate = new Date().toISOString();

    // Calcula o total usando os dados capturados da compra.
    const total = productsToFinalize.reduce((sum, product) => {

      const hasPrice =
        product.price !== null &&
        product.price !== undefined &&
        product.price !== "";

      if (!hasPrice) return sum;

      return sum + (
        Number(product.price) * Number(product.quantity)
      );

    }, 0);

    // Cria o registro definitivo da compra.
    const purchase = {

      id: window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `purchase-${Date.now()}-${Math.random()}`,

      date: purchaseDate,
      createdAt: purchaseDate,

      source: draftTypeToFinalize,

      products: productsToFinalize,

      total: total,
      missingPriceCount: productsWithoutPrice.length

    };

    // Salva a compra e remove somente seu rascunho.
    await window.database.savePurchaseAndDeleteDraft(
      purchase,
      draftIdToFinalize
    );

    // Atualiza o cartão da última compra.
    await loadLatestPurchase();

    // Limpa somente a sessão que acabou de ser finalizada.
    if (currentDraftId === draftIdToFinalize) {

      products = [];
      purchaseStarted = false;

      currentDraftId = null;
      currentDraftType = null;
      currentDraftCreatedAt = null;

      renderProducts();

      renderOngoingPurchaseCard(null);

      showScreen("home");

    }

    showToast("Compra finalizada e salva!");

    console.log("Compra registrada:", purchase);

  } catch (error) {

    console.error("Erro ao finalizar compra:", error);

    showToast("Não foi possível finalizar a compra.");

  } finally {

    // Libera a finalização novamente.
    purchaseFinalizing = false;

    finishButton.disabled = false;
    finishButton.textContent = "Finalizar compra";

    productForm.querySelectorAll("input, select, button").forEach(control => {
      control.disabled = false;
    });

    productList.querySelectorAll("input, button").forEach(control => {
      control.disabled = false;
    });

  }

});


/* =================================
   15. AÇÕES DOS BOTÕES
================================= */

document.querySelectorAll("[data-action]").forEach(button => {

  button.addEventListener("click", () => {

    const action = button.dataset.action;

    switch (action) {

      case "new-purchase":

        showScreen("new-purchase");

        break;

      case "resume-purchase":

        resumePurchase();

        break;

      case "open-latest-purchase":

        if (!latestPurchase) {
          showToast("Nenhuma compra registrada ainda.");
          break;
        }

        showScreen("history");

        openPurchaseDetails(latestPurchase);

        break;

      case "start-empty":

        startEmptyPurchase();

        break;

      case "load-standard":

        showToast(
          "O carregamento da lista padrão será implementado em breve."
        );

        break;

      case "previous-purchase":

        showToast(
          "A seleção de compras anteriores será implementada em breve."
        );

        break;

      case "back-to-new-purchase":

        showScreen("new-purchase");

        break;
        
    }

  });

});

/* =================================
   16. INICIALIZAÇÃO DO APLICATIVO
================================= */

async function initializeApp() {

  updateDate();

  // Aguarda a inicialização do IndexedDB.
  await window.databaseReady;

  // Recupera a compra em andamento, se existir.
  await loadCurrentDraft();

  // Atualiza o cartão da última compra.
  await loadLatestPurchase();

  // Prepara os produtos para quando a compra for retomada.
  renderProducts();

  // Sempre inicia na tela inicial.
  showScreen("home");

  console.log("Minhas Compras iniciado com sucesso!");

}

initializeApp();