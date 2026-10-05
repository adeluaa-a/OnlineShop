terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38"
    }
  }
}

provider "kubernetes" {
  config_path    = "~/.kube/config"
  config_context = "kind-onlineshop"
}

data "kubernetes_namespace" "onlineshop" {
  metadata {
    name = "onlineshop"
  }
}

resource "kubernetes_service_account" "onlineshop" {
  metadata {
    name      = "onlineshop-sa"
    namespace = data.kubernetes_namespace.onlineshop.metadata[0].name
  }
}

resource "kubernetes_secret" "onlineshop" {
  metadata {
    name      = "onlineshop-basic-secret"
    namespace = data.kubernetes_namespace.onlineshop.metadata[0].name
  }

  type = "Opaque"

  data = {
    environment = "development"
  }
}
