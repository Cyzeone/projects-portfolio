
/* =================================
   MINHAS COMPRAS
   1. CONFIGURAÇÕES DO BANCO
================================= */

const DB_NAME = "MinhasComprasDB";
const DB_VERSION = 1;

let db = null;


/* =================================
   2. ABRIR O BANCO DE DADOS
================================= */

function openDatabase() {

  return new Promise((resolve, reject) => {

    const request = indexedDB.open(DB_NAME, DB_VERSION);


    // Criação e atualização da estrutura do banco

    request.onupgradeneeded = event => {

      const database = event.target.result;


      // PRODUTOS

      if (!database.objectStoreNames.contains("products")) {

        const productsStore = database.createObjectStore(
          "products",
          { keyPath: "id" }
        );

        productsStore.createIndex(
          "name",
          "name",
          { unique: false }
        );

        productsStore.createIndex(
          "categoryId",
          "categoryId",
          { unique: false }
        );

      }


      // CATEGORIAS

      if (!database.objectStoreNames.contains("categories")) {

        const categoriesStore = database.createObjectStore(
          "categories",
          { keyPath: "id" }
        );

        categoriesStore.createIndex(
          "name",
          "name",
          { unique: false }
        );

      }


      // COMPRAS FINALIZADAS

      if (!database.objectStoreNames.contains("purchases")) {

        const purchasesStore = database.createObjectStore(
          "purchases",
          { keyPath: "id" }
        );

        purchasesStore.createIndex(
          "date",
          "date",
          { unique: false }
        );

      }


      // COMPRAS EM ANDAMENTO

      if (!database.objectStoreNames.contains("drafts")) {

        const draftsStore = database.createObjectStore(
          "drafts",
          { keyPath: "id" }
        );

        draftsStore.createIndex(
          "updatedAt",
          "updatedAt",
          { unique: false }
        );

      }


      // CONFIGURAÇÕES

      if (!database.objectStoreNames.contains("settings")) {

        database.createObjectStore(
          "settings",
          { keyPath: "key" }
        );

      }

    };


    // Banco aberto com sucesso

    request.onsuccess = event => {

      db = event.target.result;

      // Fecha a conexão se outra versão do banco
      // precisar ser aberta posteriormente.

      db.onversionchange = () => {

        db.close();
        db = null;

        console.warn(
          "O banco foi fechado para atualização."
        );

      };

      resolve(db);

    };


    // Erro ao abrir o banco

    request.onerror = event => {

      console.error(
        "Erro ao abrir o banco:",
        event.target.error
      );

      reject(event.target.error);

    };


    // Outra aba pode estar bloqueando a atualização

    request.onblocked = () => {

      console.warn(
        "A abertura do banco está aguardando outra conexão."
      );

    };

  });

}


/* =================================
   3. DISPONIBILIZAR O BANCO
================================= */

window.database = {

  open: openDatabase,

  get connection() {
    return db;
  }

};


/* =================================
   4. INICIALIZAÇÃO
================================= */

window.databaseReady = openDatabase()

  .then(database => {

    console.log(
      "Banco IndexedDB aberto com sucesso!",
      database.name
    );

    console.log(
      "Estruturas disponíveis:",
      Array.from(database.objectStoreNames)
    );

    return database;

  })

  .catch(error => {

    console.error(
      "Não foi possível inicializar o banco de dados:",
      error
    );

    return null;

  });


/* =================================
   5. OPERAÇÕES DO BANCO DE DADOS
================================= */

// Estruturas autorizadas do banco

const VALID_STORES = [
  "products",
  "categories",
  "purchases",
  "drafts",
  "settings"
];


// Verifica a conexão com o banco

async function getReadyDatabase() {

  if (!db) {
    await openDatabase();
  }

  if (!db) {
    throw new Error("Banco de dados indisponível.");
  }

  return db;
}


// Executa uma operação dentro de uma transação

async function executeDatabaseOperation(
  storeName,
  mode,
  operation
) {

  if (!VALID_STORES.includes(storeName)) {
    throw new Error("Estrutura do banco inválida.");
  }

  const database = await getReadyDatabase();

  return new Promise((resolve, reject) => {

    const transaction = database.transaction(
      storeName,
      mode
    );

    const store = transaction.objectStore(storeName);

    let result;
    let operationError = null;


    try {

      const request = operation(store);

      request.onsuccess = () => {
        result = request.result;
      };

      request.onerror = event => {
        operationError = event.target.error;
      };

    } catch (error) {

      operationError = error;
      transaction.abort();

    }


    // Operação concluída

    transaction.oncomplete = () => {

      if (operationError) {
        reject(operationError);
        return;
      }

      resolve(result);

    };


    // Erro durante a transação

    transaction.onerror = event => {

      reject(
        operationError ||
        event.target.error ||
        new Error("Erro na transação.")
      );

    };


    transaction.onabort = event => {

      reject(
        operationError ||
        event.target.error ||
        new Error("Transação cancelada.")
      );

    };

  });

}


/* =================================
   6. INSERIR REGISTROS
================================= */

async function addRecord(storeName, data) {

  return executeDatabaseOperation(
    storeName,
    "readwrite",
    store => store.add(data)
  );

}


/* =================================
   7. CONSULTAR UM REGISTRO
================================= */

async function getRecord(storeName, id) {

  return executeDatabaseOperation(
    storeName,
    "readonly",
    store => store.get(id)
  );

}


/* =================================
   8. CONSULTAR TODOS OS REGISTROS
================================= */

async function getAllRecords(storeName) {

  return executeDatabaseOperation(
    storeName,
    "readonly",
    store => store.getAll()
  );

}


/* =================================
   9. ATUALIZAR REGISTROS
================================= */

async function updateRecord(storeName, data) {

  return executeDatabaseOperation(
    storeName,
    "readwrite",
    store => store.put(data)
  );

}


/* =================================
   10. EXCLUIR REGISTROS
================================= */

async function deleteRecord(storeName, id) {

  return executeDatabaseOperation(
    storeName,
    "readwrite",
    store => store.delete(id)
  );

}


/* =================================
   11. FINALIZAR COMPRA
================================= */

async function savePurchaseAndDeleteDraft(purchase, draftId) {

  if (!purchase || !purchase.id) {
    throw new Error("Dados da compra inválidos.");
  }

  if (!draftId) {
    throw new Error("Identificador do rascunho inválido.");
  }

  const database = await getReadyDatabase();

  return new Promise((resolve, reject) => {

    const transaction = database.transaction(
      ["purchases", "drafts"],
      "readwrite"
    );

    const purchasesStore = transaction.objectStore("purchases");
    const draftsStore = transaction.objectStore("drafts");

    let operationError = null;

    // Primeiro verifica se o rascunho existe.
    const draftRequest = draftsStore.get(draftId);

    draftRequest.onsuccess = () => {

      if (!draftRequest.result) {

        operationError = new Error(
          "O rascunho não existe ou já foi finalizado."
        );

        transaction.abort();

        return;
      }

      // Registra a compra finalizada.
      purchasesStore.add(purchase);

      // Remove somente o rascunho correspondente.
      draftsStore.delete(draftId);

    };

    transaction.oncomplete = () => {
      resolve(true);
    };

    transaction.onerror = event => {

      reject(
        operationError ||
        event.target.error ||
        new Error("Erro ao finalizar compra.")
      );

    };

    transaction.onabort = event => {

      reject(
        operationError ||
        event.target.error ||
        new Error("Finalização cancelada.")
      );

    };

  });

}


/* =================================
   12. DISPONIBILIZAR AS OPERAÇÕES
================================= */

Object.assign(window.database, {

  add: addRecord,

  get: getRecord,

  getAll: getAllRecords,

  update: updateRecord,

  delete: deleteRecord,

  savePurchaseAndDeleteDraft: savePurchaseAndDeleteDraft

});


console.log("Operações do banco carregadas!");


