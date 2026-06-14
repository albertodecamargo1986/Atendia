"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Eye } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  email: string;
  cpf_cnpj: string;
  phone: string;
  licenseCount: number;
  created_at: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);

    fetch(`/api/customers?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCustomers(data.data || []);
      })
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou CPF/CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Nome</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">E-mail</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">CPF/CNPJ</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Telefone</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Licencas</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Cadastro</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    Carregando...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {customer.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {customer.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {customer.cpf_cnpj}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {customer.phone}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        {customer.licenseCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(customer.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                        title="Ver detalhes"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
